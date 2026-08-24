// Drive helpers
export async function fetchStructure(path = '../data/papers/structure.json'){
  try{
    const res = await fetch(path, {cache:'no-store'});
    if(!res.ok) return null;
    return await res.json();
  }catch(e){ console.warn('fetchStructure failed', e); return null; }
}

export function openDrivePreview(fileId){
  if(!fileId) return alert('File not available');
  const url = `https://drive.google.com/file/d/${fileId}/preview`;
  window.open(url, '_blank');
}
