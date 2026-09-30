import { redirect } from "next/navigation";

/** Sends the former account address, including old bookmarks and link callbacks, to settings. */
export default function AccountRedirect() {
  redirect("/settings/account");
}
