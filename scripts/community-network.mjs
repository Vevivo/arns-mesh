#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateInvitation,encodeInvitation} from '../src/network-invitation.mjs';
const bundled=fileURLToPath(new URL('../resources/network-continuity.json',import.meta.url));
export function communityInvitation(file=bundled){
 let value;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error('community_network_unavailable: use --network with a valid invitation');}
 if(value.schema!=='arns-mesh-bundled-continuity/v1'||!Array.isArray(value.invitations)||value.invitations.length!==1)throw new Error('one_signed_community_network_required: use --network to choose another network');
 const invitation=validateInvitation(value.invitations[0]);if(invitation.version!==2)throw new Error('durable_community_invitation_required');
 return invitation;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{console.log(encodeInvitation(communityInvitation()));}catch(e){console.error(e.message);process.exitCode=1;}
}
