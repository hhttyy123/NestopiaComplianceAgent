// Discovery anchors, not embedded legal rules. Download and verify on each cache cycle.
// Supplemented by the current project's live search results and supplied documents.
export const discoverySources=[
 'https://assets.montgomerycountymd.gov/files/2026-09/Ordinance%2020-36%20%28ZTA%2026-06%29.pdf',
 'https://apps.montgomerycountymd.gov/ccllims/DownloadFilePage?FileName=2930_1_27107_Bill_41-26_Action_20261110.pdf',
];
export const isAdministrativeCase=(url:string)=>/\/OZAH\//i.test(url)||/\/(?:ADO|ADW)[\s%_\d-]/i.test(url);
export function decisionParagraphs<T extends {text:string}>(paragraphs:T[]){return paragraphs.filter(p=>/ORDERED|CONCLUSION AND ORDER|hereby orders|must\s+deny|be\s+APPROVED/i.test(p.text.replace(/\s+/g,' '))).slice(-3);}
