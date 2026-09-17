import ctypes as C,sys,json
class R(C.Structure): _fields_=[('x',C.c_short),('y',C.c_short),('width',C.c_ushort),('height',C.c_ushort)]
x=C.CDLL('libX11.so.6');s=C.CDLL('libXext.so.6');x.XOpenDisplay.restype=C.c_void_p;x.XFree.argtypes=[C.c_void_p];x.XCloseDisplay.argtypes=[C.c_void_p]
s.XShapeGetRectangles.argtypes=[C.c_void_p,C.c_ulong,C.c_int,C.POINTER(C.c_int),C.POINTER(C.c_int)];s.XShapeGetRectangles.restype=C.POINTER(R)
d=x.XOpenDisplay(None);result={}
for kind in [0,2]:
 n=C.c_int();o=C.c_int();rs=s.XShapeGetRectangles(d,int(sys.argv[1]),kind,C.byref(n),C.byref(o)); result[str(kind)]=[[rs[i].x,rs[i].y,rs[i].width,rs[i].height] for i in range(n.value)];x.XFree(rs)
print(json.dumps(result));x.XCloseDisplay(d)
