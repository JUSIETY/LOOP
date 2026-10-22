// Public photo results describe shape/material candidates. Training labels may
// encode a product's contents or use, which a photograph does not establish.
const objectLabels: Record<string,string> = {
  food:'음식물류', 'animal-remains':'기타 물품', cardboard:'종이 상자', paper:'종이류',
  'paper-cup':'종이컵', 'glass-bottle':'유리병', 'glass-container':'유리 용기',
  'glass-object':'유리 물품', ceramic:'도자기류', 'drink-can':'금속 캔', 'food-can':'금속 캔',
  construction:'기타 물품', 'metal-container':'금속 용기', 'plastic-bag':'비닐류',
  'plastic-bottle':'플라스틱병', 'plastic-container':'플라스틱 용기', 'plastic-cup':'플라스틱 컵',
  'plastic-small':'플라스틱 물품', 'detergent-bottle':'플라스틱병', carton:'종이팩',
  textile:'섬유류', shoe:'신발류', glove:'장갑류', mask:'마스크류', bandage:'위생용품류',
  medicine:'용도 확인이 필요한 물품', syringe:'용도 확인이 필요한 물품', diaper:'위생용품류',
  cable:'전선류', circuit:'전자 부품', laptop:'전자제품류', 'small-appliance':'전자제품류',
  phone:'전자제품류', battery:'배터리류', thermometer:'용도 확인이 필요한 물품',
  cigarette:'기타 물품', pesticide:'용기류', aerosol:'금속 용기', foam:'완충재류',
};
const categoryLabels: Record<string,string> = {
  battery:'배터리류', cardboard:'종이 상자', carton:'종이팩', ceramic:'도자기류',
  electronics:'전자제품류', foam:'완충재류', food:'음식물류', glass:'유리류',
  hazardous:'용기류', medical:'용도 확인이 필요한 물품', metal:'금속류', other:'기타 물품',
  paper:'종이류', plastic:'플라스틱류', shoe:'신발류', textile:'섬유류',
  vegetation:'식물성 잔재', vinyl:'비닐류', trash:'기타 물품',
};
const boothLabels: Record<string,string> = {
  'pet-bottle':'플라스틱병', 'drink-can':'금속 캔', cardboard:'종이 상자',
  'glass-bottle':'유리병', 'milk-carton':'종이팩', 'used-tissue':'종이류',
  'plastic-container':'플라스틱 용기', 'snack-wrapper':'봉지·포장류',
  'thermal-receipt':'종이류', 'dirty-paper-cup':'종이컵',
};
export const objectCandidateLabel = (id:string) => objectLabels[id] || '품목 확인이 필요한 물품';
export const categoryCandidateLabel = (id:string) => categoryLabels[id] || '품목 확인이 필요한 물품';
export const boothCandidateLabel = (id:string) => boothLabels[id] || '품목 확인이 필요한 물품';

const materialCategories = new Set(['cardboard','carton','ceramic','foam','glass','metal','paper','plastic','textile','vinyl']);
export const candidateMaterial = (id:string|undefined) => id && materialCategories.has(id) ? id : undefined;
