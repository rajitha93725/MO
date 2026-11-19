import { redirect } from "next/navigation";

// The app opens on the Order page. The Home dashboard lives at /home.
export default function Root() {
  redirect("/order");
}
