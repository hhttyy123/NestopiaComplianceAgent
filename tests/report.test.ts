import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import Report from '../src/components/research-report';
import type {ResearchRun} from '../src/domain/research';
it('旧报告也只显示新入口，不回退显示旧的长回答',()=>{const run={id:'old',requestKey:'old',input:{product:'ADU',location:'County',facts:'Known inputs',refresh:false},status:'COMPLETE',phase:'complete',createdAt:'2026-11-16',updatedAt:'2026-11-16',analysis:{summary:'old summary must not be shown',jurisdiction:'jurisdiction',findings:[{category:'TIMELINE',topic:'time',status:'UNKNOWN',advice:'old uncertain long answer',citations:[]}],missing:[],nextSteps:['next'],timing:'time'},evidence:[],queries:[],warnings:[],metrics:{searchRequests:0,fetchRequests:0,queryHits:0,sourceHits:0},experienceIds:[],model:'test',version:'old'} satisfies ResearchRun;const html=renderToStaticMarkup(React.createElement(Report,{run}));expect(html).toContain('建筑可行性');expect(html).toContain('许可与材料');expect(html).toContain('预计流程');expect(html).not.toContain('old uncertain long answer');expect(html).not.toContain('old summary must not be shown');expect(html).not.toContain('能不能建');});
