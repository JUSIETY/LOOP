"use client";
import {useEffect,useState} from 'react';
import {materialNames} from '../lib/kaggle-classifier';
type Metrics={classes:string[];splitCounts:Record<string,number>;testAccuracy:number;testCount:number;acceptedCount:number;acceptedAccuracy:number|null;coverage:number;perClass:Record<string,{precision:number;recall:number;support:number}>};
type Source={key:string;title:string;url:string;rawImageEntries:number;selectedBeforeDedup:number;uniqueImageMembership:number;license:string;excluded:Record<string,number>};
type Report={uniqueImages:number;splitCounts:Record<string,number>;sources:Source[];names:Record<string,string>;fine:Metrics;coarse:Metrics};
export default function KaggleReport(){
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let active=true;fetch('/models/kaggle-waste-v2/report.json').then(r=>{if(!r.ok)throw Error();return r.json() as Promise<Report>}).then(r=>{if(active)setReport(r)}).catch(()=>{if(active)setError(true)});return()=>{active=false}},[]);
 const pct=(n:number|null)=>n===null?'—':(n*100).toFixed(1)+'%';
 return <section className="lab-panel"><div className="lab-smallcaps">KAGGLE 3종 · 학습 및 별도 평가</div><h3>품목과 재질을 각각 학습했어요</h3><p>MobileNet V2가 이미지 특징을 추출하고, 새로 학습한 두 분류기가 세부 품목과 재질을 판단해요. 카메라 사진은 브라우저에서 처리해요. 아래 수치는 학습에 사용하지 않은 Kaggle 사진의 내부 평가 결과예요.</p>
 {!report?<p role="status">{error?'평가 보고서를 불러오지 못했어요. 새로고침해 주세요.':'평가 보고서를 불러오는 중…'}</p>:<>
 <div className="lab-stats"><div className="lab-stat"><small>중복·충돌 제거 후 사진</small><b>{report.uniqueImages.toLocaleString()}</b><small>학습 {report.splitCounts.train.toLocaleString()} · 검증 {report.splitCounts.validation.toLocaleString()} · 평가 {report.splitCounts.test.toLocaleString()}</small></div><div className="lab-stat"><small>세부 품목 {report.fine.classes.length}종 정확도</small><b>{pct(report.fine.testAccuracy)}</b><small>별도 평가 {report.fine.testCount.toLocaleString()}장</small></div><div className="lab-stat"><small>재질·대분류 {report.coarse.classes.length}종 정확도</small><b>{pct(report.coarse.testAccuracy)}</b><small>별도 평가 {report.coarse.testCount.toLocaleString()}장</small></div></div>
 <p className="lab-note">품목 분류기의 보류 기준을 통과한 사진: {report.fine.acceptedCount.toLocaleString()}장 / {report.fine.testCount.toLocaleString()}장({pct(report.fine.coverage)}), 해당 사진 정확도 {pct(report.fine.acceptedAccuracy)}. 실제 화면은 품목·재질 판단의 일치 여부도 확인해요. 이 수치를 한국 분리배출 정답률로 볼 수는 없어요.</p>
 <div className="lab-table-wrap"><table className="lab-table"><caption>다운로드한 원본과 학습에 선택한 이미지</caption><thead><tr><th>자료</th><th>압축파일 내 이미지</th><th>정리 후 선택</th></tr></thead><tbody>{report.sources.map(s=><tr key={s.key}><td><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><br/><small>{s.license}</small></td><td>{s.rawImageEntries.toLocaleString()}</td><td>{s.selectedBeforeDedup.toLocaleString()}</td></tr>)}</tbody></table></div>
 <p className="lab-note">TriCascade는 같은 사진의 3단계 반복 중 세부 품목 단계만 사용했어요. Trashbox의 ‘음식물이 아님’은 품목이 특정되지 않아 제외했고, 음식물 사진은 편중을 줄이기 위해 6,000장으로 제한했어요. 이후 세 자료 전체에서 파일·정규화 픽셀 중복과 라벨 충돌을 제거했어요.</p>
 <details><summary>품목별 평가 결과</summary><div className="lab-table-wrap"><table className="lab-table"><thead><tr><th>품목</th><th>평가 사진</th><th>정밀도</th><th>재현율</th></tr></thead><tbody>{report.fine.classes.map(c=><tr key={c}><td>{report.names[c]||materialNames[c]||c}</td><td>{report.fine.perClass[c].support}</td><td>{pct(report.fine.perClass[c].precision)}</td><td>{pct(report.fine.perClass[c].recall)}</td></tr>)}</tbody></table></div></details>
 <p className="lab-note">비슷한 사진 묶음은 학습·검증·평가 중 한 곳에만 넣었어요. 물체 고유번호가 없어 모든 관련 사진의 중복을 보장해서 제거할 수는 없어요. 한국 현장 사진의 정확도, 투명도·오염 상태·지역별 수거 가능 여부는 별도로 확인해야 해요. Household 자료는 교육·연구·비상업 사용 조건도 명시하고 있어 학교 체험용으로 사용해요.</p>
 <div className="lab-actions"><a className="lab-button" href="/models/kaggle-waste-v2/report.json" download>전체 평가 보고서 JSON</a></div>
 </>}
 </section>;
}
