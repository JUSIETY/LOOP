'use client';
import {useEffect,useState} from 'react';
import {materialNames} from '../lib/kaggle-classifier';
type Report={uniqueImages:number;splitCounts:Record<string,number>;testAccuracy:number;testCount:number;acceptedCount:number;acceptedAccuracy:number;coverage:number;classes:string[];perClass:Record<string,{precision:number;recall:number;support:number}>;datasetUrl:string};
export default function KaggleReport(){
 const [report,setReport]=useState<Report|null>(null);const [error,setError]=useState(false);
 useEffect(()=>{let active=true;fetch('/models/kaggle-waste/report.json').then(r=>{if(!r.ok)throw Error();return r.json() as Promise<Report>}).then(r=>{if(active)setReport(r)}).catch(()=>{if(active)setError(true)});return()=>{active=false}},[]);
 const pct=(n:number)=>(n*100).toFixed(1)+'%';
 return <section className="lab-panel"><div className="lab-smallcaps">KAGGLE · 실제 사진 학습 완료</div><h3>6종 재질 분류 모델</h3><p>MobileNet 이미지 특징 위에 새 분류기를 학습했어요. 이 기기의 사진을 추가하지 않아도 기본으로 사용해요. 아래는 원본 사진 한 장 기준의 Kaggle 데이터 내부 평가 결과예요. 현재 카메라는 세로·가로 사진의 중앙 확대 결과도 비교하며, 이 추가 처리의 현장 정확도는 별도로 측정하지 않았어요.</p>
 {!report?<p role="status">{error?'평가 보고서를 불러오지 못했어요. 새로고침해 주세요.':'평가 보고서를 불러오는 중…'}</p>:<>
 <div className="lab-stats"><div className="lab-stat"><small>학습 사진</small><b>{report.splitCounts.train}</b><small>중복 제거 후 {report.uniqueImages}장 중</small></div><div className="lab-stat"><small>검증 / 최종 평가</small><b>{report.splitCounts.validation} / {report.testCount}</b><small>학습에 사용하지 않은 사진</small></div><div className="lab-stat"><small>전체 평가 정확도</small><b>{pct(report.testAccuracy)}</b><small>보류 전 6종 재질 분류</small></div></div>
 <p className="lab-note">확실한 후보만 제시하는 기준 적용 시: {report.testCount}장 중 {report.acceptedCount}장 제시({pct(report.coverage)}), 제시한 사진의 정확도 {pct(report.acceptedAccuracy)}. 나머지는 확인을 요청해요. 이 수치는 물건의 한국 분리배출 정답률이 아니에요.</p>
 <div className="lab-table-wrap"><table className="lab-table"><caption>최종 평가 · 재질별 성능</caption><thead><tr><th>재질</th><th>평가 사진</th><th>정밀도</th><th>재현율</th></tr></thead><tbody>{report.classes.map(c=><tr key={c}><td>{materialNames[c]}</td><td>{report.perClass[c].support}</td><td>{pct(report.perClass[c].precision)}</td><td>{pct(report.perClass[c].recall)}</td></tr>)}</tbody></table></div>
 <p className="lab-note">대부분 밝은 배경의 단일 물체 사진이에요. 투명 음료 페트병·종이팩·비닐·오염 정도를 별도로 학습한 데이터는 아니에요. 매우 비슷한 사진은 같은 데이터 묶음에 넣었지만 물체 식별자가 없어 모든 유사 표본 누출을 보장해서 제거할 수는 없어요.</p>
 <div className="lab-actions"><a className="lab-button" href={report.datasetUrl} target="_blank" rel="noreferrer">Kaggle 원본 ↗</a><a className="lab-button" href="https://github.com/garythung/trashnet" target="_blank" rel="noreferrer">TrashNet · Gary Thung &amp; Mindy Yang ↗</a><a className="lab-button" href="/models/kaggle-waste/report.json" download>평가 보고서 JSON</a></div>
 </>}
 </section>
}
