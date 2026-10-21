import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'LOOP · AI 분리배출 챌린지',description:'찍고, 맞히고, 다시 쓰다. 카메라와 데이터로 만드는 우리 학교의 분리배출 챌린지.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
