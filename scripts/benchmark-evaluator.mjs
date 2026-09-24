import fs from 'node:fs';
const cases=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/evidence-benchmark.json',import.meta.url),'utf8'));
const file=process.argv[2];
if(!file){console.log(JSON.stringify({status:'not_executed',cases:cases.cases.length,label_status:cases.label_status,instructions:'Supply predictions.json from an actual semantic evaluation; fixtures alone do not measure model accuracy.'},null,2));}
else {
 const predictions=JSON.parse(fs.readFileSync(file,'utf8')).predictions;
 if(!Array.isArray(predictions)||new Set(predictions.map(p=>p.id)).size!==predictions.length)throw Error('Invalid or duplicate predictions');
 if(predictions.some(p=>!cases.cases.some(c=>c.id===p.id)||!['pass','fail','insufficient_evidence'].includes(p.outcome)))throw Error('Unknown case or outcome');
 let fp=0,fn=0,correct=0,abstentions=0,ambiguous=0;
 for(const c of cases.cases){const p=predictions.find(p=>p.id===c.id);if(c.expected==='insufficient_evidence'){ambiguous++;continue;}if(!p||p.outcome==='insufficient_evidence'){abstentions++;continue;}if(c.expected===p.outcome)correct++;else if(p.outcome==='fail')fp++;else fn++;}
 const negative=cases.cases.filter(c=>c.expected==='pass').length,positive=cases.cases.filter(c=>c.expected==='fail').length;
 console.log(JSON.stringify({label_status:cases.label_status,false_positives:fp,false_negatives:fn,false_positive_rate:negative?fp/negative:null,false_negative_rate:positive?fn/positive:null,correct,abstentions,ambiguous,coverage:(correct+fp+fn)/(positive+negative),limitations:'Rates use provisional labels; report abstentions separately. Not a human-reviewed model accuracy claim.'},null,2));
}
