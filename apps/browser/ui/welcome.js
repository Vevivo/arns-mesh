document.getElementById('start-nav').addEventListener('submit',event=>{
 event.preventDefault();const value=document.getElementById('start-address').value.trim();
 try{if(!value||/[\s\u0000-\u001f]/u.test(value))throw new Error();const url=new URL(value.includes('://')?value:'ar://'+value);if(url.protocol!=='ar:'||!url.hostname||url.username||url.password||url.port)throw new Error();window.location.href=url.href;}
 catch{document.getElementById('start-error').textContent='Enter an ArNS name or an ar:// address.';}
});
