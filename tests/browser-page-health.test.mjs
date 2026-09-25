import test from 'node:test';
import assert from 'node:assert/strict';
import {Tabs} from '../apps/browser/tabs.mjs';
import {consoleIssue,recordPageIssue,updatePageHealth} from '../apps/browser/page-health.mjs';
import {plainError} from '../apps/browser/response.mjs';

test('policy reports and late script errors make a verified document partial without weakening verification',()=>{
 const tabs=new Tabs(),tab=tabs.create('sample');tab.phase='loaded';tab.meta={contentSignatureVerified:true};
 const message='Loading media from  \'https://arweave.net/raw/id\' violates the following Content Security Policy directive: "default-src self". The action has been blocked.';
 const issue=consoleIssue({level:'error',message});assert.equal(issue.url,'https://arweave.net/raw/id');
 assert.equal(recordPageIssue(tab,issue),true);assert.equal(recordPageIssue(tab,issue),false);
 updatePageHealth(tab);assert.equal(tab.phase,'partial');assert.equal(tab.resources.blocked,1);assert.equal(tab.meta.contentSignatureVerified,true);
 const script=consoleIssue({},3,'Uncaught ReferenceError: Quill is not defined');recordPageIssue(tab,script);
 assert.equal(tab.resources.scriptErrors,1);assert.equal(consoleIssue({level:'error',message:'Failed to load resource: status 502'}),null);
 for(let i=0;i<100;i++)recordPageIssue(tab,{kind:'script',message:'TypeError: '+i,source:'renderer-console'});
 assert.equal(tab.resources.diagnostics.length,64);assert.equal(tab.resources.diagnosticsTruncated,true);
 tabs.begin(tab.id,'another');assert.equal(tab.resources.blocked,0);assert.equal(tab.resources.scriptErrors,0);
});

test('expired leases are distinguished from unavailable name sources',()=>{
 const result=plainError(new Error('current_name_state_unavailable: no_state_evidence: arns_lease_expired'));
 assert.match(result,/lease is expired/);assert.match(result,/RPC observation/);assert.match(result,/clock/);
});
