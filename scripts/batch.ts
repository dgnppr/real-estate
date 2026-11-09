// 배치 1회 실행 (cron/launchd 용): npm run batch  [-- --force]
import { runBatch } from "../lib/watch";

const force = process.argv.includes("--force");
runBatch("batch", { force }).then((r) => {
  console.log(`[batch] ${new Date().toLocaleString()}`);
  for (const line of r.log) console.log("  " + line);
  process.exit(r.error ? 1 : 0);
});
