// 수도권 시군구 법정동코드(앞 5자리). 규제지역 여부는 lib/rules.ts 의 설정값으로 판단
import { regionOf } from "./rules";
export { regionOf };
export type Region = "reg" | "metro" | "local";

const RAW: Record<string, string> = {
  서울: "11110 종로,11140 중구,11170 용산,11200 성동,11215 광진,11230 동대문,11260 중랑,11290 성북,11305 강북,11320 도봉,11350 노원,11380 은평,11410 서대문,11440 마포,11470 양천,11500 강서,11530 구로,11545 금천,11560 영등포,11590 동작,11620 관악,11650 서초,11680 강남,11710 송파,11740 강동",
  경기: "41111 수원 장안,41113 수원 권선,41115 수원 팔달,41117 수원 영통,41131 성남 수정,41133 성남 중원,41135 성남 분당,41150 의정부,41171 안양 만안,41173 안양 동안,41192 부천 원미,41194 부천 소사,41196 부천 오정,41210 광명,41220 평택,41271 안산 상록,41273 안산 단원,41281 고양 덕양,41285 고양 일산동,41287 고양 일산서,41290 과천,41310 구리,41360 남양주,41370 오산,41390 시흥,41410 군포,41430 의왕,41450 하남,41461 용인 처인,41463 용인 기흥,41465 용인 수지,41480 파주,41500 이천,41570 김포,41590 화성,41610 광주,41630 양주",
  인천: "28110 중구,28140 동구,28177 미추홀,28185 연수,28200 남동,28237 부평,28245 계양,28260 서구",
};

export interface Sgg { code: string; sido: string; name: string; full: string; region: Region }

export const SGG_LIST: Sgg[] = Object.entries(RAW).flatMap(([sido, list]) =>
  list.split(",").map((x) => {
    const [code, ...n] = x.split(" ");
    const name = n.join(" ");
    return { code, sido, name, full: `${sido} ${name}`, region: regionOf(code) };
  }),
);

export function findSgg(query: string): Sgg[] {
  const q = query.replace(/\s+/g, "");
  return SGG_LIST.filter((s) => s.code === q || s.full.replace(/\s+/g, "").includes(q) || s.name.replace(/\s+/g, "").includes(q));
}

export const REGION_LABEL: Record<Region, string> = { reg: "규제지역", metro: "수도권", local: "지방" };
export const REGION_FULL: Record<Region, string> = { reg: "규제지역(서울·경기 12곳)", metro: "수도권 비규제", local: "지방" };
