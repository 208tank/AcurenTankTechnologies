import {Section,TankType,Technology,sections,tankTypes} from './tank-data';
export type PresentationSlide={technologyId:string;tankType:TankType;section:Section};
export const PRESENTATION_KEY='tankscope-presentation-v1';
export function validatePresentation(value:unknown):PresentationSlide[]{
 const v=value as {version?:unknown;slides?:unknown};
 if(!v||v.version!==1||!Array.isArray(v.slides)||v.slides.length>1000)throw new Error('Saved presentation could not be read. Your library has not been changed.');
 const ids=new Set<string>();
 return v.slides.map((s:unknown)=>{
  const x=s as PresentationSlide;
  if(!x||typeof x.technologyId!=='string'||!x.technologyId||ids.has(x.technologyId)||!tankTypes.some(t=>t.id===x.tankType)||!sections.some(t=>t.id===x.section))throw new Error('Saved presentation contains invalid slides. Your library has not been changed.');
  ids.add(x.technologyId);return {technologyId:x.technologyId,tankType:x.tankType,section:x.section};
 });
}
export function slideSections(t:Technology,type:TankType){return t.sections.filter(s=>!(type==='efr'&&s==='roof'));}
export function slideTypes(t:Technology){return t.tankTypes.filter(type=>slideSections(t,type).length>0);}
export function createSlide(t:Technology):PresentationSlide|null{
 const tankType=slideTypes(t)[0];if(!tankType)return null;
 return {technologyId:t.id,tankType,section:slideSections(t,tankType)[0]};
}
export function resolveSlides(slides:PresentationSlide[],data:Technology[]){
 return slides.flatMap(s=>{
  const technology=data.find(t=>t.id===s.technologyId);if(!technology)return [];
  const types=slideTypes(technology);const tankType=types.includes(s.tankType)?s.tankType:types[0];if(!tankType)return [];
  const allowed=slideSections(technology,tankType);const section=allowed.includes(s.section)?s.section:allowed[0];
  return [{...s,tankType,section,technology}];
 });
}
export function moveSlide(slides:PresentationSlide[],index:number,delta:number){
 const target=index+delta;if(index<0||index>=slides.length||target<0||target>=slides.length)return slides;
 const result=[...slides];[result[index],result[target]]=[result[target],result[index]];return result;
}
