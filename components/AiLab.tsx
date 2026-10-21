"use client";

import { useEffect, useRef, useState } from "react";
import { addSample, clearSamples, deleteSample, evaluateSamples, exportSamples, importSamples, listSamples, loadVision, type EvaluationResult, type VisionItem, type VisionSample } from "@/lib/vision";

import KaggleReport from "./KaggleReport";

type Props = { items: Array<{ id: string; name: string; emoji: string }>; onNotice: (message: string) => void };
const pct = (value: number) => `${Math.round(value * 100)}%`;

export default function AiLab({ items, onNotice }: Props) {
  const [samples, setSamples] = useState<VisionSample[]>([]);
  const [itemId, setItemId] = useState(items[0]?.id || "");
  const [split, setSplit] = useState<"train" | "test">("train");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<EvaluationResult | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const refresh = async () => { setSamples(await listSamples()); setReport(null); };

  useEffect(() => {
    const update = () => { void refresh().catch(error => setError(error.message)); };
    update();
    window.addEventListener("loop-vision-change", update);
    return () => window.removeEventListener("loop-vision-change", update);
  }, []);
  useEffect(() => { if (!items.some(item => item.id === itemId)) setItemId(items[0]?.id || ""); }, [items, itemId]);

  const trainCount = samples.filter(sample => sample.split === "train").length;
  const testCount = samples.length - trainCount;
  const trainedClasses = new Set(samples.filter(sample => sample.split === "train").map(sample => sample.itemId)).size;
  const nameOf = (id: string | null) => items.find(item => item.id === id)?.name || "인식 불가";

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setStatus("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "처리 중 오류가 발생했어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const chosen = Array.from(files);
    if (chosen.length > 100) { setError("한 번에 최대 100장까지 추가해 주세요."); return; }
    await run(async () => {
      let added = 0;
      const failures: string[] = [];
      for (let i = 0; i < chosen.length; i++) {
        setStatus(`${i + 1}/${chosen.length} · ${chosen[i].name}`);
        try { await addSample(chosen[i], itemId, split, message => setStatus(`${i + 1}/${chosen.length} · ${message}`)); added++; }
        catch (error) {
          failures.push(error instanceof Error ? error.message : "이미지를 추가하지 못했어요.");
          if (failures[failures.length - 1].includes("모델을 불러오지")) break;
        }
      }
      await refresh();
      setStatus(`${added}장 추가 완료${failures.length ? ` · ${failures.length}장 건너뜀` : ""}`);
      if (failures.length) setError([...new Set(failures)].slice(0, 3).join(" "));
      if (added) onNotice(`${split === "train" ? "학습" : "평가"} 이미지 ${added}장을 이 기기에 저장했어요.`);
    });
    if (uploadRef.current) uploadRef.current.value = "";
  }

  async function download() {
    await run(async () => {
      const text = await exportSamples();
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `LOOP-AI-dataset-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("데이터를 내보냈어요. 다른 기기에서 가져오기로 사용할 수 있어요.");
    });
  }

  return <div className="lab-root">
    <style>{`
      .lab-root{display:grid;gap:22px}.lab-topnote{border-left:3px solid #b7cc90;padding:4px 0 4px 18px;color:#657266;font-size:14px;line-height:1.8}.lab-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.lab-stat{background:#fff;border:1px solid #e0e5da;border-radius:16px;padding:20px}.lab-stat b{display:block;font-size:30px;color:#173b2b;letter-spacing:-1px;margin:5px 0}.lab-stat small{color:#788176}.lab-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:20px}.lab-panel{padding:26px;border-radius:20px;border:1px solid #e0e5da;background:white}.lab-panel h3{font-size:18px;margin:0 0 8px;color:#173b2b}.lab-panel p{color:#758071;font-size:13px;line-height:1.75;margin:0 0 20px}.lab-field{display:grid;gap:8px;margin:18px 0;color:#314c39;font-size:13px;font-weight:600}.lab-select{padding:12px 14px;border:1px solid #d7dfd0;border-radius:10px;background:#fafbf7;width:100%;font:inherit;color:#1f3f2e}.lab-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lab-tabs button{padding:12px;border:1px solid #dce3d5;border-radius:10px;background:#fafbf8;color:#667460;font:inherit;cursor:pointer}.lab-tabs button[aria-pressed=true]{background:#eef4e5;border-color:#9ab66f;color:#254727;font-weight:700}.lab-button{padding:12px 17px;border:1px solid #dce3d5;border-radius:10px;background:#fff;color:#254727;font:inherit;font-size:13px;font-weight:600;cursor:pointer;min-height:44px}.lab-button-primary{background:#23593d;color:#fff;border-color:#23593d}.lab-button:disabled,.lab-tabs button:disabled{opacity:.5;cursor:wait}.lab-upload{display:grid;gap:9px;align-content:center;justify-items:center;min-height:145px;width:100%;border:1.5px dashed #9eb887;background:#f7f9f0;border-radius:14px;color:#2d5135;cursor:pointer;font:inherit;padding:22px}.lab-upload strong{font-size:15px}.lab-upload small{color:#87917e}.lab-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.lab-progress{font-size:13px;background:#eef4e7;color:#315b37;padding:13px 16px;border-radius:10px;overflow-wrap:anywhere}.lab-error{font-size:13px;background:#fff3e9;color:#9a542d;padding:13px 16px;border-radius:10px;line-height:1.8}.lab-class-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 0;border-bottom:1px solid #edf0e8;font-size:13px}.lab-class-row:last-child{border-bottom:none}.lab-class-row span:first-child{display:flex;align-items:center;gap:9px}.lab-class-row small{color:#7d8977;font-size:12px;white-space:nowrap}.lab-empty{padding:28px 10px;text-align:center;color:#88917e;font-size:13px;line-height:1.9}.lab-compare{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px}.lab-result{padding:22px;border-radius:14px;background:#f3f5ee}.lab-result:last-child{background:#eaf2dd}.lab-result b{display:block;font-size:38px;color:#254727;margin:10px 0}.lab-result span{color:#657561;font-size:13px}.lab-table-wrap{overflow-x:auto}.lab-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:20px;text-align:left}.lab-table th{color:#829078;font-weight:500}.lab-table th,.lab-table td{padding:12px 10px;border-bottom:1px solid #edf0e8}.lab-file-row{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #edf0e8;font-size:12px}.lab-file-row div{min-width:0}.lab-file-row strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;color:#3e513b;font-weight:500}.lab-file-row small{color:#8c9784}.lab-remove{border:0;background:#f7f3ed;color:#936d51;border-radius:6px;padding:8px 11px;cursor:pointer;flex-shrink:0}.lab-note{font-size:12px;color:#86917f;line-height:1.8;margin-top:18px}.lab-smallcaps{font-size:10px;letter-spacing:1.3px;font-weight:700;color:#81916e;margin-bottom:9px}.lab-danger{color:#a05c3c;border-color:#e3c7b6}.lab-clear-confirm{padding:15px;background:#fff7ee;border-radius:10px;font-size:13px;margin-top:15px}.lab-clear-confirm p{margin:0 0 10px;color:#8b6047}@media(max-width:760px){.lab-layout{grid-template-columns:1fr}.lab-stats{gap:8px}.lab-stat{padding:15px 12px}.lab-stat b{font-size:25px}.lab-panel{padding:20px}.lab-file-row strong{max-width:210px}}
    `}</style>
    <KaggleReport/>
    <div className="lab-topnote">직접 찍은 사진으로 인식 성능을 비교해 보세요. MobileNet의 이미지 특징과 <strong>k-NN 최근접 이웃 분류</strong>를 사용해요. 사진 원본은 전송하지 않고, 이미지 특징만 이 브라우저에 저장해요.</div>
    <div className="lab-stats">
      <div className="lab-stat"><small>학습 이미지</small><b>{trainCount}<small> 장</small></b><small>최근접 이웃 비교에 사용</small></div>
      <div className="lab-stat"><small>평가 이미지</small><b>{testCount}<small> 장</small></b><small>성능 측정에만 사용</small></div>
      <div className="lab-stat"><small>등록한 품목</small><b>{trainedClasses}<small> / {items.length}</small></b><small>품목별 3장 이상 · 최소 2종 필요</small></div>
    </div>
    <div className="lab-layout">
      <section className="lab-panel">
        <div className="lab-smallcaps">01 / COLLECT</div><h3>우리 부스의 이미지 모으기</h3><p>품목별로 다른 각도·조명·배경에서 찍은 사진을 준비하세요. 학습용과 평가용은 별도로 촬영해 주세요.</p>
        <label className="lab-field">사진 속 품목<select className="lab-select" disabled={busy} value={itemId} onChange={event => setItemId(event.target.value)}>{items.map(item => <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>)}</select></label>
        <div className="lab-field"><span>데이터 용도</span><div className="lab-tabs"><button disabled={busy} aria-pressed={split === "train"} onClick={() => setSplit("train")}>학습용</button><button disabled={busy} aria-pressed={split === "test"} onClick={() => setSplit("test")}>평가용 · 학습에 사용 안 함</button></div></div>
        <button className="lab-upload" disabled={busy || !itemId} onClick={() => uploadRef.current?.click()}><span aria-hidden="true" style={{ fontSize: 30, lineHeight: 1 }}>＋</span><strong>{busy ? "이미지 특징을 읽고 있어요…" : "이미지 선택하기"}</strong><small>JPG · PNG · 여러 장 선택 가능 · 파일당 20MB 이하</small></button>
        <input ref={uploadRef} type="file" accept="image/*" multiple hidden aria-label="학습 또는 평가 이미지 선택" onChange={event => void upload(event.target.files)} />
        <div className="lab-note">권장: 품목별 학습 10장 이상 + 별도 평가 3장 이상. 같은 파일은 자동으로 중복 차단돼요. 연속 촬영한 유사 사진도 양쪽에 나눠 넣지 마세요.</div>
        <div className="lab-actions"><button className="lab-button" disabled={busy} onClick={() => void run(async () => { await loadVision(setStatus); setStatus("AI 모델 준비 완료. 챌린지에서 카메라 인식을 사용할 수 있어요."); })}>AI 모델 미리 준비</button></div>
      </section>
      <section className="lab-panel">
        <div className="lab-smallcaps">02 / DATASET</div><h3>품목별 데이터 현황</h3><p>품목별 3장·2종 이상일 때 유사도를 비교해요. 근거가 부족하면 Kaggle 재질 분류기를 사용해요.</p>
        {items.map(item => <div className="lab-class-row" key={item.id}><span><span aria-hidden="true">{item.emoji}</span>{item.name}</span><small>학습 {samples.filter(sample => sample.itemId === item.id && sample.split === "train").length} · 평가 {samples.filter(sample => sample.itemId === item.id && sample.split === "test").length}</small></div>)}
        <div className="lab-actions"><button className="lab-button" disabled={busy || !samples.length} onClick={() => void download()}>데이터 내보내기</button><button className="lab-button" disabled={busy} onClick={() => importRef.current?.click()}>가져오기</button></div>
        <input ref={importRef} type="file" accept="application/json,.json" hidden aria-label="LOOP 학습 데이터 가져오기" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(async () => { if (file.size > 60_000_000) throw new Error("60MB 이하의 데이터 파일을 선택해 주세요."); const result = await importSamples(await file.text(), items.map(item => item.id)); await refresh(); setStatus(`${result.added}장 가져옴 · 중복 ${result.duplicates}장 제외`); }); }} />
        <div className="lab-note">데이터는 이 기기에만 저장돼요. 다른 부스 기기에서는 JSON 파일을 가져오세요. 내보내기 파일에는 원본 사진이 포함되지 않아요.</div>
      </section>
    </div>
    {status && <div className="lab-progress" role="status">{status}</div>}
    {error && <div className="lab-error" role="alert">{error}</div>}
    <section className="lab-panel">
      <div className="lab-smallcaps">03 / COMPARE</div><h3>같은 평가 이미지로, 성능 비교하기</h3><p>범용 모델의 분류 결과와 직접 모은 이미지의 k-NN 분류를 비교해요. 평가 데이터는 학습에서 제외하며, 인식 불가도 오답으로 계산해요.</p>
      <button className="lab-button lab-button-primary" disabled={busy || !trainCount || !testCount} onClick={() => void run(async () => { const result = await evaluateSamples(items as VisionItem[]); setReport(result); setStatus(`학습 ${result.trainCount}장 · 별도 평가 ${result.testCount}장으로 비교했어요.`); })}>성능 비교 실행 ↗</button>
      {!report ? <div className="lab-empty">학습 이미지와 별도의 평가 이미지를 추가하면<br />실제 정확도와 품목별 혼동 결과가 여기에 표시돼요.</div> : <>
        <div className="lab-compare"><div className="lab-result"><span>기본 모델 · ImageNet 품목 연결</span><b>{pct(report.baselineAccuracy)}</b><span>인식 불가 {report.baselineUnknown} / 평가 {report.testCount}장</span></div><div className="lab-result"><span>직접 모은 데이터 · k-NN</span><b>{pct(report.customAccuracy)}</b><span>인식 불가 {report.customUnknown} / 평가 {report.testCount}장</span></div></div>
        <div className="lab-table-wrap"><table className="lab-table"><caption style={{ textAlign: "left", paddingTop: 20, fontWeight: 700 }}>품목별 정확도</caption><thead><tr><th>정답 품목</th><th>평가 수</th><th>기본 모델</th><th>내 데이터</th></tr></thead><tbody>{report.classes.map(row => <tr key={row.itemId}><td>{nameOf(row.itemId)}</td><td>{row.count}장</td><td>{pct(row.baselineCorrect / row.count)}</td><td>{pct(row.customCorrect / row.count)}</td></tr>)}</tbody></table></div>
        <div className="lab-table-wrap"><table className="lab-table"><caption style={{ textAlign: "left", paddingTop: 20, fontWeight: 700 }}>내 데이터 모델의 혼동 결과</caption><thead><tr><th>실제 품목</th><th>예측 품목</th><th>횟수</th></tr></thead><tbody>{report.confusion.map(row => <tr key={`${row.actual}-${row.predicted}`}><td>{nameOf(row.actual)}</td><td>{nameOf(row.predicted)}</td><td>{row.count}</td></tr>)}</tbody></table></div>
        <div className="lab-note">평가 {report.testCount}장의 결과이며 실제 부스 전체 성능을 보장하지 않아요. 사진 수·품목별 수·촬영 조건을 함께 기록하세요. 기본 모델은 폐기물 전용 모델이 아니므로 일부 품목 이름을 제공하지 않아요.</div>
      </>}
    </section>
    {!!samples.length && <section className="lab-panel"><h3>등록한 이미지 특징</h3><p>최근 12개 표시 · 삭제하면 다음 인식과 평가에 바로 반영돼요.</p>{[...samples].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12).map(sample => <div className="lab-file-row" key={sample.id}><div><strong>{sample.filename}</strong><small>{nameOf(sample.itemId)} · {sample.split === "train" ? "학습용" : "평가용"} · {new Date(sample.createdAt).toLocaleDateString("ko-KR")}</small></div><button disabled={busy} className="lab-remove" aria-label={`${sample.filename} 삭제`} onClick={() => void run(async () => { await deleteSample(sample.id); await refresh(); setStatus("이미지 특징을 삭제했어요."); })}>삭제</button></div>)}<div className="lab-actions"><button className="lab-button lab-danger" disabled={busy} onClick={() => setConfirmClear(true)}>데이터 전체 삭제</button></div>{confirmClear && <div className="lab-clear-confirm"><p>이 기기의 학습·평가 이미지 특징 {samples.length}개를 삭제해요. 필요하면 먼저 내보내기를 해 주세요.</p><div className="lab-actions"><button className="lab-button lab-danger" disabled={busy} onClick={() => void run(async () => { await clearSamples(); await refresh(); setConfirmClear(false); setStatus("이 기기의 이미지 특징 데이터를 모두 삭제했어요."); })}>전체 삭제 확인</button><button className="lab-button" disabled={busy} onClick={() => setConfirmClear(false)}>취소</button></div></div>}</section>}
  </div>;
}
