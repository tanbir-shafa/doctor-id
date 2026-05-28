import { dbConnect, dbDisconnect } from "../src/lib/db/mongoose";
import { Doctor } from "../src/lib/db/models";

async function main() {
  await dbConnect();
  const docs = await (Doctor as never as { find: Function })
    .find({ status: "published" })
    .select("slug")
    .limit(3)
    .lean();
  for (const d of docs as { slug: string }[]) console.log(d.slug);
  await dbDisconnect();
}
main();
