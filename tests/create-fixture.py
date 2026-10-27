from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
folder = Path(__file__).parent
manifest = '''<?xml version="1.0" encoding="utf-8"?>
<manifest identifier="fixture" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
 xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
<metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
<organizations default="org"><organization identifier="org"><title>Package de test</title>
<item identifier="a" identifierref="ra"><title>SCO A</title></item>
<item identifier="b" identifierref="rb"><title>SCO B</title></item>
</organization></organizations>
<resources><resource identifier="ra" type="webcontent" adlcp:scormtype="sco" href="a.html"><file href="a.html" /></resource>
<resource identifier="rb" type="webcontent" adlcp:scormtype="sco" href="b.html"><file href="b.html" /></resource></resources>
</manifest>'''
html = '''<!doctype html><html><body><h1>SCO NAME</h1>
<button id="write">Transmettre la note 85 et completed</button>
<button id="commit">Commit</button><button id="finish">Finish</button>
<script>
const api=parent.API; document.body.dataset.init=api.LMSInitialize('');
document.querySelector('#write').addEventListener('click',()=>{
 api.LMSSetValue('cmi.core.score.raw','85'); api.LMSSetValue('cmi.core.lesson_status','completed'); });
document.querySelector('#commit').addEventListener('click',()=>api.LMSCommit(''));
document.querySelector('#finish').addEventListener('click',()=>api.LMSFinish(''));
</script></body></html>'''
with ZipFile(folder / '_fixture-scorm12.zip', 'w', ZIP_STORED) as z:
 z.writestr('imsmanifest.xml',manifest)
 z.writestr('a.html',html.replace('NAME','A'))
 z.writestr('b.html',html.replace('NAME','B'))
print(folder / '_fixture-scorm12.zip')
