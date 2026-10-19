export async function fetchJson(url,options={}) {
  const {timeoutMs=20000,...requestOptions}=options;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetch(url,{...requestOptions,signal:controller.signal});
    const value=await response.json();
    if(!response.ok)throw Error(value?.error||`HTTP ${response.status}`);
    return value;
  } catch(error) {
    if(error.name==='AbortError')throw Error('Richiesta scaduta. I dati inseriti sono conservati; riprova.');
    throw error;
  } finally {clearTimeout(timer);}
}
