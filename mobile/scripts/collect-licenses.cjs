const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const mobile=path.resolve(__dirname,'..'),root=path.resolve(mobile,'..'),out=path.join(mobile,'public/licenses');
fs.mkdirSync(out,{recursive:true});
const fromMobile=createRequire(path.join(mobile,'package.json')),fromRoot=createRequire(path.join(root,'package.json'));
const visited=new Set(),records=[];
function directory(requireFrom,name){
 try{return path.dirname(requireFrom.resolve(name+'/package.json'))}catch{}
 let current=path.dirname(requireFrom.resolve(name));
 while(current!==path.dirname(current)){const file=path.join(current,'package.json');if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).name===name)return current;current=path.dirname(current)}
 throw Error('Cannot locate license package '+name);
}
function collect(name,requireFrom){
 const folder=directory(requireFrom,name),pkg=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8')),key=pkg.name+'@'+pkg.version;
 if(visited.has(key))return;visited.add(key);
 const notices=fs.readdirSync(folder,{withFileTypes:true}).filter(file=>file.isFile()&&/^(licen[cs]e|copying|notice)([.-]|$)/i.test(file.name));
 const texts=notices.map(file=>fs.readFileSync(path.join(folder,file.name),'utf8'));
 const file=key.replace(/[^A-Za-z0-9_.-]/g,'_')+'.txt';
 fs.writeFileSync(path.join(out,file),key+'\nLicense: '+JSON.stringify(pkg.license??pkg.licenses??'See package documentation')+'\n\n'+texts.join('\n\n'));
 records.push({name:pkg.name,version:pkg.version,file});
 const nested=createRequire(path.join(folder,'package.json'));for(const child of Object.keys(pkg.dependencies??{}))collect(child,nested);
}
for(const name of ['@capacitor/core','@capacitor/android','idb','react','react-dom','react-virtuoso','uuid','core-js'])collect(name,fromMobile);
for(const name of ['@fontsource/courier-prime','lucide-react','mammoth','jszip'])collect(name,fromRoot);
for(const [source,name] of [['LICENSE','Screenplay-Studio-MIT.txt'],['src/assets/fonts/OFL.txt','Screenplay-CJK-OFL.txt'],['src/assets/fonts/FONT-NOTICE.md','Screenplay-CJK-Modification.txt']])fs.copyFileSync(path.join(root,source),path.join(out,name));
fs.copyFileSync(path.join(mobile,'src/assets/fonts/FONT-NOTICE.md'),path.join(out,'Android-CJK-Modification.txt'));
fs.writeFileSync(path.join(out,'index.json'),JSON.stringify({edition:'Android '+JSON.parse(fs.readFileSync(path.join(mobile,'package.json'),'utf8')).version,components:records.sort((a,b)=>a.name.localeCompare(b.name))},null,2));
console.log('Bundled third-party notices: '+records.length+' packages plus project and font licenses.');
