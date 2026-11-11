"""wisps.py fig.blend [maxverts] [zbelow]: delete tiny hair-card islands (strand wisps) that hang lowest over the forehead; their tips read
as dark ticks on the hairline. Only islands of <= maxverts verts whose lowest point is below top-zbelow and |x| < 0.06."""
import bpy,bmesh,sys
from collections import Counter
a=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
MV=int(a[1]) if len(a)>1 else 12; ZB=float(a[2]) if len(a)>2 else 0.04
bpy.ops.wm.open_mainfile(filepath=a[0])
o=sorted([x for x in bpy.data.objects if x.type=='MESH' and '_LOD' in x.name],key=lambda x:x.name)[0]
bm=bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
isl={}; cur=0
for v in bm.verts:
    if v.index in isl: continue
    st=[v]; isl[v.index]=cur
    while st:
        x=st.pop()
        for e in x.link_edges:
            y=e.other_vert(x)
            if y.index not in isl: isl[y.index]=cur; st.append(y)
    cur+=1
cnt=Counter(isl.values()); top=max(v.co.z for v in bm.verts)
groups={}
for v in bm.verts: groups.setdefault(isl[v.index],[]).append(v)
kill=[]
for i,vs in groups.items():
    if cnt[i]>MV: continue
    zmin=min(v.co.z for v in vs); xc=sum(v.co.x for v in vs)/len(vs); yc=sum(v.co.y for v in vs)/len(vs)
    if zmin < top-ZB and zmin > top-0.12 and abs(xc)<0.06 and yc < 0: kill+=vs
bmesh.ops.delete(bm,geom=kill,context='VERTS'); bm.to_mesh(o.data); bm.free()
print('WISPS verts removed',len(kill)); bpy.ops.wm.save_mainfile()
