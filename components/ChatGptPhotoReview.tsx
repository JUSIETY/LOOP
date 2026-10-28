'use client';
import {useState} from 'react';
import {chatGptPhotoCanvas,chatGptWebPrompt,parseChatGptWebReply} from '../lib/chatgpt-vision';
import type {Recognition,VisionItem} from '../lib/vision';
import './ChatGptPhotoReview.css';

type Props={source:HTMLImageElement|HTMLCanvasElement;items:VisionItem[];onApply:(result:Recognition)=>void;onSkip:()=>void};
export default function ChatGptPhotoReview({source,items,onApply,onSkip}:Props){
 const [answer,setAnswer]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[copying,setCopying]=useState(false);
 const prompt=chatGptWebPrompt(items),url='https://chatgpt.com/?q='+encodeURIComponent(prompt);
 function photo(){const canvas=chatGptPhotoCanvas(source);return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('사진을 준비하지 못했어요.')),'image/png'));}
 function save(blob:Blob){const file=URL.createObjectURL(blob),a=document.createElement('a');a.href=file;a.download='LOOP-ChatGPT-확인사진.png';a.click();setTimeout(()=>URL.revokeObjectURL(file),1000);}
 async function downloadPhoto(){setError('');try{save(await photo());setMessage('사진을 PNG로 저장했어요. ChatGPT에 직접 첨부해 주세요.')}catch(e){setError((e as Error).message)}}
 async function copyPrompt(){try{await navigator.clipboard.writeText(prompt);setMessage('질문을 복사했어요. ChatGPT 입력창에 붙여넣어 주세요.')}catch{setError('질문 복사가 막혀 있어요. 아래 질문 보기에서 직접 선택해 복사해 주세요.')}}
 async function openChatGpt(){
  if(copying)return;setCopying(true);setError('');setMessage('');
  let blob:Promise<Blob>;try{blob=photo()}catch(e){setError((e as Error).message);setCopying(false);return}
  let copied:Promise<void>|null=null;
  try{if(window.isSecureContext&&navigator.clipboard?.write&&typeof ClipboardItem!=='undefined')copied=navigator.clipboard.write([new ClipboardItem({'image/png':blob,'text/plain':new Blob([prompt],{type:'text/plain'})})]);}catch{/* The download below remains available. */}
  window.open(url,'_blank','noopener,noreferrer');
  try{
   if(copied){try{await copied;setMessage('사진과 질문을 복사했어요. ChatGPT 입력창에 붙여넣고 사진이 첨부됐는지 확인해 주세요. 답변이 나오면 아래에 붙여넣으세요.');return}catch{/* Some browsers cannot copy images. */}}
   save(await blob);let textCopied=false;try{await navigator.clipboard.writeText(prompt);textCopied=true}catch{}
   setMessage('사진 PNG를 저장했어요. ChatGPT에 직접 첨부해 주세요. '+(textCopied?'질문은 복사했어요.':'질문이 입력되지 않았다면 아래 질문 보기에서 복사해 주세요.'));
  }catch(e){setError((e as Error).message||'사진 복사가 막혀 있어요. 사진 PNG 저장 버튼을 이용해 주세요.')}finally{setCopying(false)}
 }
 function apply(){setError('');try{onApply(parseChatGptWebReply(answer,items))}catch(e){setError((e as Error).message)}}
 return <section className="chatgpt-review" aria-label="ChatGPT 웹에서 사진 확인"><span className="eyebrow">CHATGPT 웹 확인 · API 키 불필요</span><h3>ChatGPT에서 사진을 확인해 보세요.</h3><p>사진만으로 용도를 구분하기 어려워요. 사진을 복사해 ChatGPT에 직접 첨부하고, 답변을 이곳에 붙여넣어 주세요. 무료 이용 한도나 로그인이 적용될 수 있어요.</p><div className="chatgpt-review-actions"><button className="btn primary" disabled={copying} onClick={()=>void openChatGpt()}>{copying?'사진 준비 중…':'사진 복사하고 ChatGPT 열기'}</button><button className="btn secondary" onClick={()=>void downloadPhoto()}>사진 PNG 저장</button><button className="btn secondary" onClick={()=>void copyPrompt()}>질문 복사</button><a href={url} target="_blank" rel="noopener noreferrer">ChatGPT 직접 열기 ↗</a></div><p className="chatgpt-review-note">사진은 자동으로 첨부되지 않아요. 직접 붙여넣거나 저장한 PNG를 첨부해야 해요. ChatGPT에 첨부한 사진과 질문은 OpenAI로 전송돼요.</p>{message&&<p role="status" className="inline-status">{message}</p>}<details><summary>ChatGPT에 보낼 질문 보기</summary><textarea readOnly aria-label="ChatGPT에 보낼 질문" value={prompt}/></details><label className="chatgpt-reply-label">ChatGPT의 JSON 답변<textarea value={answer} maxLength={10000} onChange={e=>setAnswer(e.target.value)} placeholder={'{"label":"물건 이름","itemId":null,"material":"unknown","detail":"확인할 점"}'}/></label>{error&&<p className="inline-alert" role="alert">{error}</p>}<div className="chatgpt-review-actions"><button className="btn primary" disabled={!answer.trim()} onClick={apply}>분류 결과 적용</button><button className="btn secondary" onClick={onSkip}>품목 직접 선택</button></div><small>외부 답변은 품목 후보로만 사용해요. 배출 정답과 점수는 부스에 설정한 기준으로 채점해요.</small></section>;
}
