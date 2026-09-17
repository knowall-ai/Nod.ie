import ctypes as C,sys,json
class R(C.Structure): _fields_=[('x',C.c_short),('y',C.c_short),('width',C.c_ushort),('height',C.c_ushort)]
x=C.CDLL('libX11.so.6');s=C.CDLL('libXext.so.6');x.XOpenDisplay.restype=C.c_void_p;x.XFree.argtypes=[C.c_void_p];x.XCloseDisplay.argtypes=[C.c_void_p]
s.XShapeGetRectangles.argtypes=[C.c_void_p,C.c_ulong,C.c_int,C.POINTER(C.c_int),C.POINTER(C.c_int)];s.XShapeGetRectangles.restype=C.POINTER(R)
x.XGetGeometry.argtypes=[C.c_void_p,C.c_ulong,C.POINTER(C.c_ulong),C.POINTER(C.c_int),C.POINTER(C.c_int),*[C.POINTER(C.c_uint)]*4]
x.XQueryTree.argtypes=[C.c_void_p,C.c_ulong,C.POINTER(C.c_ulong),C.POINTER(C.c_ulong),C.POINTER(C.POINTER(C.c_ulong)),C.POINTER(C.c_uint)]
d=x.XOpenDisplay(None)
def geometry(target):
 root,px,py=C.c_ulong(),C.c_int(),C.c_int()
 w,h,b,depth=C.c_uint(),C.c_uint(),C.c_uint(),C.c_uint()
 if not x.XGetGeometry(d,target,C.byref(root),C.byref(px),C.byref(py),C.byref(w),C.byref(h),C.byref(b),C.byref(depth)): raise RuntimeError('Window unavailable')
 return px.value,py.value,w.value,h.value
def tree(target):
 root,parent=C.c_ulong(),C.c_ulong();children=C.POINTER(C.c_ulong)();count=C.c_uint()
 if not x.XQueryTree(d,target,C.byref(root),C.byref(parent),C.byref(children),C.byref(count)): raise RuntimeError('Window unavailable')
 values=[children[i] for i in range(count.value)];x.XFree(children)
 return root.value,parent.value,values
client=int(sys.argv[1]);targets=[client];current=client;size=geometry(client)[2:]
for _ in range(4):
 root,parent,_children=tree(current)
 if parent==root or not parent: break
 if tree(parent)[2]!=[current] or geometry(parent)[2:]!=size or geometry(current)[:2]!=(0,0): break
 targets.append(parent);current=parent
result={}
for target in targets:
 if '--reset-input' in sys.argv:
  s.XShapeCombineMask.argtypes=[C.c_void_p,C.c_ulong,C.c_int,C.c_int,C.c_int,C.c_ulong,C.c_int]
  x.XSync.argtypes=[C.c_void_p,C.c_int]
  s.XShapeCombineMask(d,target,2,0,0,0,0);x.XSync(d,0)
 shapes={}
 for kind in [0,2]:
  n=C.c_int();o=C.c_int();rs=s.XShapeGetRectangles(d,target,kind,C.byref(n),C.byref(o));shapes[str(kind)]=[[rs[i].x,rs[i].y,rs[i].width,rs[i].height] for i in range(n.value)];x.XFree(rs)
 result[str(target)]=shapes
print(json.dumps(result));x.XCloseDisplay(d)
