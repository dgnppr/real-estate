// 한국은행 ECOS — 예금은행 대출금리(신규취급액 기준) 중 주택담보대출·일반신용대출
import { cached } from "./cache";
import { monthsBack } from "./molit";
import type { Rates } from "../calc";

const key = () => process.env.ECOS_KEY || "";
const STAT = () => process.env.ECOS_STAT_CODE || "121Y006";
export const ecosEnabled = () => !!key();

interface EcosRow { ITEM_CODE: string; ITEM_NAME: string; CYCLE?: string; TIME?: string; DATA_VALUE?: string }

async function ecos(pathPart: string) {
  const res = await fetch(`https://ecos.bok.or.kr/api/${pathPart}`, { cache: "no-store" });
  const j = await res.json();
  if (j.RESULT) throw new Error(`ECOS 오류 ${j.RESULT.CODE}: ${j.RESULT.MESSAGE}`);
  return j;
}

export interface RatePoint { rate: number; time: string; item: string; history: { time: string; rate: number }[] }

async function load(): Promise<{ mortgage: RatePoint | null; credit: RatePoint | null }> {
  const list = await ecos(`StatisticItemList/${key()}/json/kr/1/200/${STAT()}`);
  const items: EcosRow[] = list.StatisticItemList?.row || [];
  const find = (re: RegExp) => items.find((r) => r.CYCLE === "M" && re.test(r.ITEM_NAME)) || items.find((r) => re.test(r.ITEM_NAME));
  const yms = monthsBack(8);
  const pick = async (re: RegExp): Promise<RatePoint | null> => {
    const it = find(re);
    if (!it) return null;
    const j = await ecos(`StatisticSearch/${key()}/json/kr/1/20/${STAT()}/M/${yms.at(-1)}/${yms[0]}/${it.ITEM_CODE}`);
    const rows: EcosRow[] = j.StatisticSearch?.row || [];
    const last = rows.at(-1);
    return last ? { rate: +last.DATA_VALUE!, time: last.TIME!, item: it.ITEM_NAME, history: rows.map((r) => ({ time: r.TIME!, rate: +r.DATA_VALUE! })) } : null;
  };
  const [mortgage, credit] = await Promise.all([pick(/주택담보/), pick(/일반신용/)]);
  return { mortgage, credit };
}

export async function getRates(): Promise<(Rates & { mortgage: RatePoint | null; credit: RatePoint | null }) | null> {
  if (!ecosEnabled()) return null;
  return cached("ecos:rates", 6 * 3600e3, load);
}
