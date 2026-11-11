"""Generate clearly synthetic local QA videos; OpenCV is only used by this developer check."""
import cv2
import numpy as np
import math
import tempfile
from pathlib import Path

out=Path(tempfile.gettempdir())/'snail-video-analysis-qa'
out.mkdir(exist_ok=True)
for suffix,codec in [('mp4','mp4v'),('webm','VP80')]:
    path=out/f'synthetic_tracking.{suffix}'
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*codec),30,(640,360))
    if not writer.isOpened():
        print('Codec unavailable:',codec)
        continue
    for i in range(90):
        t=i/30
        a=np.full((360,640,3),(247,243,237),dtype=np.uint8)
        distance=90*t+10*t*t
        x=int(round(85+distance*math.cos(.12)));y=int(round(100+distance*math.sin(.12)))
        cv2.line(a,(0,142),(640,219),(175,155,135),2)
        cv2.circle(a,(x,y),38,(255,245,228),-1)
        cv2.circle(a,(x,y),38,(75,51,24),3)
        phi=.12+.3*math.sin(5*t)
        ix=int(round(x+25*math.sin(phi)*math.cos(.12)-25*math.cos(phi)*math.sin(.12)))
        iy=int(round(y+25*math.sin(phi)*math.sin(.12)+25*math.cos(phi)*math.cos(.12)))
        cv2.circle(a,(ix,iy),10,(96,76,54),-1)
        cv2.rectangle(a,(ix-3,iy-4),(ix+1,iy-1),(220,210,200),-1)
        angle=distance/38-.8
        mx=int(round(x+30*math.cos(angle)));my=int(round(y+30*math.sin(angle)))
        cv2.rectangle(a,(mx-4,my-4),(mx+4,my+4),(105,56,228),-1)
        cv2.line(a,(15,320),(115,320),(75,51,24),3)
        cv2.putText(a,'SYNTHETIC VIDEO - NOT EXPERIMENT',(18,25),cv2.FONT_HERSHEY_SIMPLEX,.45,(150,120,100),1)
        writer.write(a)
    writer.release()
    print(path)
