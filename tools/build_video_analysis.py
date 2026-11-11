"""Embed the offline video workspace into both standalone HTML entry points."""
from pathlib import Path
import base64
import re

ROOT = Path(__file__).resolve().parents[1]
core = (ROOT / 'assets/video-analysis-core.js').read_text(encoding='utf-8')
ui = (ROOT / 'assets/video-analysis-ui.js').read_text(encoding='utf-8')
template = (ROOT / 'src/video-analysis.template.html').read_text(encoding='utf-8')
analyzer = template.replace('/* CORE_SOURCE */', core).replace('/* UI_SOURCE */', ui)
(ROOT / 'video-analysis.html').write_text(analyzer, encoding='utf-8', newline='\n')

p = ROOT / 'index.html'
s = p.read_text(encoding='utf-8')
if 'data-view="videoAnalysisPage"' not in s:
    s = s.replace('</nav>', '<button class="view-tab" data-view="videoAnalysisPage">视频分析</button></nav>', 1)
if 'id="videoAnalysisPage"' not in s:
    s = s.replace('<script>\n"use strict";', '<section id="videoAnalysisPage" class="hidden" style="padding:12px;max-width:1700px;margin:auto"><iframe id="videoAnalysisFrame" title="本地视频分析工作台" sandbox="allow-scripts allow-downloads" style="border:1px solid #dce2ea;border-radius:12px;width:100%;height:calc(100vh - 160px);min-height:700px;background:white"></iframe></section>\n<script>\n"use strict";', 1)
s = s.replace('.view-nav{display:flex;gap:8px;', '.view-nav{display:flex;flex-wrap:wrap;gap:8px;')
old = 'function showView(id){document.querySelectorAll(".view-tab").forEach(b=>b.classList.toggle("active",b.dataset.view===id));$("overviewPage").classList.toggle("hidden",id!=="overviewPage");$("simulatorPage").classList.toggle("hidden",id!=="simulatorPage");window.scrollTo({top:0,behavior:"smooth"});}'
new = 'function showView(id){document.querySelectorAll(".view-tab").forEach(b=>b.classList.toggle("active",b.dataset.view===id));for(const pageId of ["overviewPage","simulatorPage","videoAnalysisPage"])$(pageId).classList.toggle("hidden",id!==pageId);if(id==="videoAnalysisPage")window.prepareVideoAnalyzer?.();window.scrollTo({top:0,behavior:"smooth"});}'
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError('Simulator view function changed; review build integration.')
# Escape imported textual cells; preserve existing numeric formatting.
fields = '["trial_id","time_s","x_m","v_m_per_s","shell_angle_rad","phi_rad","center_distance_m","psi_rad","quality_flag"]'
s = s.replace('exportRowsCsv(expRows,'+fields+',trackerFileName', 'exportRowsCsv(expRows,(window.SNAIL_EXPERIMENT_FIELDS||'+fields+'),trackerFileName')
# Remove the previous generated block before embedding a fresh copy.
s = re.sub(r'\n<!-- VIDEO_ANALYSIS_BUNDLE_START -->[\s\S]*?<!-- VIDEO_ANALYSIS_BUNDLE_END -->', '', s)
encoded = base64.b64encode(analyzer.encode('utf-8')).decode('ascii')
bridge = (ROOT / 'assets/simulator-video-bridge.js').read_text(encoding='utf-8')
bundle = '\n<!-- VIDEO_ANALYSIS_BUNDLE_START -->\n<script>\nwindow.prepareVideoAnalyzer=function(){const f=document.getElementById("videoAnalysisFrame");if(!f.dataset.ready){f.srcdoc=new TextDecoder().decode(Uint8Array.from(atob("'+encoded+'"),c=>c.charCodeAt(0)));f.dataset.ready="1";}};\n'+bridge+'\n</script>\n<!-- VIDEO_ANALYSIS_BUNDLE_END -->\n'
s = s.replace('</body>', bundle+'</body>', 1)
p.write_text(s, encoding='utf-8', newline='\n')
print('Built standalone video-analysis.html and embedded index.html.')
