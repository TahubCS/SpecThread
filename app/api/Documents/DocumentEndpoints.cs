using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Documents;

// Any member of the project's team uploads, downloads, and archives reference documents (ADR-047).
internal static class DocumentEndpoints
{
    // Files pass through a Vercel function on the way in and out, whose body limit is 4.5 MB.
    public const int MaxDocumentBytes = 4 * 1024 * 1024;
    public const int MaxFileNameLength = 255;
    private const int MaxUploadRequestBytes = MaxDocumentBytes + 64 * 1024; // Room for multipart framing.

    // The stored type comes from the extension, and the file must start with that format's signature.
    private static readonly Dictionary<string, (string ContentType, byte[] Signature)> Formats =
        new(StringComparer.OrdinalIgnoreCase)
        {
            [".pdf"] = ("application/pdf", "%PDF-"u8.ToArray()),
            [".doc"] = ("application/msword", [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]),
            [".docx"] = ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", [0x50, 0x4B, 0x03, 0x04]),
        };

    public static void MapDocumentEndpoints(this IEndpointRouteBuilder app)
    {
        var byProject = app.MapGroup("/projects/{projectId:guid}/documents").WithTags("Documents")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        byProject.MapGet("/", List).WithName("ListDocuments");
        // Bearer tokens, not cookies, authenticate the API, so form posts need no antiforgery token.
        byProject.MapPost("/", Upload).WithName("UploadDocument")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(MaxUploadRequestBytes))
            .ProducesProblem(StatusCodes.Status409Conflict);

        var documents = app.MapGroup("/documents").WithTags("Documents")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        documents.MapGet("/{documentId:guid}", Get).WithName("GetDocument");
        documents.MapGet("/{documentId:guid}/content", Content).WithName("DownloadDocument")
            .Produces(StatusCodes.Status200OK, contentType: "application/octet-stream");
        documents.MapPost("/{documentId:guid}/archive", Archive).WithName("ArchiveDocument")
            .ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static async Task<Results<Ok<List<DocumentResponse>>, NotFound>> List(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await db.ProjectsFor(user.CallerId()).AnyAsync(p => p.Id == projectId, cancel)) return TypedResults.NotFound();

        var items = await db.Documents.Where(d => d.ProjectId == projectId && d.ArchivedAt == null)
            .Join(db.Set<AuthUser>(), d => d.UploadedBy, u => u.Id, (d, u) => new { Document = d, UploaderName = u.Name })
            .OrderByDescending(x => x.Document.UploadedAt).ThenBy(x => x.Document.Id)
            .Select(x => ToResponse(x.Document, x.UploaderName))
            .ToListAsync(cancel);
        return TypedResults.Ok(items);
    }

    private static async Task<Results<Created<DocumentResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Upload(
        Guid projectId, IFormFile? file, [FromForm] string? title, ClaimsPrincipal user, SpecThreadDbContext db,
        CancellationToken cancel)
    {
        var errors = new InputErrors();
        var validTitle = errors.Optional("title", title, InputErrors.MaxNameLength);
        var upload = await ReadUpload(file, errors, cancel);
        if (upload is null || errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        // Serialize with archiving and membership changes in this project's team.
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var project = await ProjectEndpoints.LockProjectForCaller(db, projectId, userId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();

        var document = new Document
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            Title = validTitle is "" ? DefaultTitle(upload.FileName) : validTitle!,
            FileName = upload.FileName,
            ContentType = upload.ContentType,
            SizeBytes = upload.Bytes.Length,
            UploadedBy = userId,
            UploadedAt = Clock.UtcNow(),
        };
        db.Documents.Add(document);
        db.DocumentContents.Add(new DocumentContent { DocumentId = document.Id, Content = upload.Bytes });
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);

        var response = await Responses(db, db.Documents.Where(d => d.Id == document.Id)).SingleAsync(cancel);
        return TypedResults.Created($"/documents/{document.Id}", response);
    }

    private static async Task<Results<Ok<DocumentResponse>, NotFound>> Get(
        Guid documentId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var document = await Responses(db, MemberDocuments(db, user.CallerId()).Where(d => d.Id == documentId))
            .SingleOrDefaultAsync(cancel);
        return document is null ? TypedResults.NotFound() : TypedResults.Ok(document);
    }

    // Archived documents and projects stay downloadable; archiving only hides them from the list.
    private static async Task<Results<FileContentHttpResult, NotFound>> Content(
        Guid documentId, ClaimsPrincipal user, HttpResponse response, SpecThreadDbContext db, CancellationToken cancel)
    {
        var file = await MemberDocuments(db, user.CallerId()).Where(d => d.Id == documentId)
            .Join(db.DocumentContents, d => d.Id, c => c.DocumentId, (d, c) => new { d.FileName, d.ContentType, c.Content })
            .SingleOrDefaultAsync(cancel);
        if (file is null) return TypedResults.NotFound();

        response.Headers.XContentTypeOptions = "nosniff";
        response.Headers.CacheControl = "private, no-store";
        // A download name makes this an attachment, so browsers never render the file in the app's origin.
        return TypedResults.File(file.Content, file.ContentType, file.FileName);
    }

    private static async Task<Results<Ok<DocumentResponse>, NotFound, ProblemHttpResult>> Archive(
        Guid documentId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var projectId = await db.Documents.Where(d => d.Id == documentId).Select(d => (Guid?)d.ProjectId).SingleOrDefaultAsync(cancel);
        var project = projectId is null ? null : await ProjectEndpoints.LockProjectForCaller(db, projectId.Value, user.CallerId(), cancel);
        if (project is null) return TypedResults.NotFound();
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();

        // Idempotent: archiving again keeps the original timestamp.
        var document = await db.Documents.SingleAsync(d => d.Id == documentId, cancel);
        document.ArchivedAt ??= Clock.UtcNow();
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);

        var response = await Responses(db, db.Documents.Where(d => d.Id == documentId)).SingleAsync(cancel);
        return TypedResults.Ok(response);
    }

    // Documents in projects the user belongs to; others look as if they do not exist.
    private static IQueryable<Document> MemberDocuments(SpecThreadDbContext db, string userId) =>
        db.Documents.Where(d => db.ProjectsFor(userId).Any(p => p.Id == d.ProjectId));

    private static IQueryable<DocumentResponse> Responses(SpecThreadDbContext db, IQueryable<Document> documents) =>
        documents.Join(db.Set<AuthUser>(), d => d.UploadedBy, u => u.Id, (d, u) => ToResponse(d, u.Name));

    private static DocumentResponse ToResponse(Document d, string uploaderName) => new(
        d.Id, d.ProjectId, d.Title, d.FileName, d.ContentType, d.SizeBytes, d.UploadedBy, uploaderName, d.UploadedAt, d.ArchivedAt);

    // Returns the cleaned upload, or null after recording an error on "file".
    private static async Task<ValidUpload?> ReadUpload(IFormFile? file, InputErrors errors, CancellationToken cancel)
    {
        if (file is null || file.Length == 0) return Reject(errors, "Choose a file to upload.");
        if (file.Length > MaxDocumentBytes) return Reject(errors, $"Use a file of at most {MaxDocumentBytes / (1024 * 1024)} MB.");

        // Browsers send a bare name, but some clients include a path in either style.
        var name = file.FileName[(file.FileName.LastIndexOfAny(['/', '\\']) + 1)..];
        name = new string(name.Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (name.Length == 0) return Reject(errors, "The file needs a name.");
        if (name.Length > MaxFileNameLength) return Reject(errors, $"Use a file name of at most {MaxFileNameLength} characters.");
        if (!Formats.TryGetValue(Path.GetExtension(name), out var format)) return Reject(errors, "Upload a PDF, DOC, or DOCX file.");

        var bytes = new byte[file.Length];
        await using (var stream = file.OpenReadStream())
        {
            await stream.ReadExactlyAsync(bytes, cancel);
        }
        if (!bytes.AsSpan().StartsWith(format.Signature)) return Reject(errors, "The file's contents don't match its type.");

        return new ValidUpload(name, format.ContentType, bytes);
    }

    private static ValidUpload? Reject(InputErrors errors, string message)
    {
        errors.Add("file", message);
        return null;
    }

    private static string DefaultTitle(string fileName)
    {
        var withoutExtension = Path.GetFileNameWithoutExtension(fileName).Trim();
        var title = withoutExtension.Length > 0 ? withoutExtension : fileName;
        return title.Length > InputErrors.MaxNameLength ? title[..InputErrors.MaxNameLength] : title;
    }

    private sealed record ValidUpload(string FileName, string ContentType, byte[] Bytes);
}

internal sealed record DocumentResponse(
    Guid Id, Guid ProjectId, string Title, string FileName, string ContentType, long SizeBytes,
    string UploadedBy, string UploadedByName, DateTime UploadedAt, DateTime? ArchivedAt);
