import numpy as np, wave, sys
sr=44100; T=16; n=sr*T; y=np.zeros(n)
rng=np.random.default_rng(3)
def add(t,x):
    i=int(t*sr); x=x[:n-i]; y[i:i+len(x)]+=x
def tone(f,d,a=0.3,dec=6):
    t=np.arange(int(d*sr))/sr; return a*np.sin(2*np.pi*f*t)*np.exp(-dec*t)
def chime(t):
    for k,f in enumerate([880,1318.5,1760]): add(t+k*0.14,tone(f,0.9,0.25,5)); add(t+k*0.14,tone(f*2,0.5,0.06,9))
chime(0.3); chime(14.0)
# riser 2.8-4.0
d=1.2; t=np.arange(int(d*sr))/sr; add(2.8,0.25*np.sin(2*np.pi*(200*t+300*t**2/(2*d)))*(t/d)**2)
# boom at 4.0
d=1.6; t=np.arange(int(d*sr))/sr
add(4.0,0.8*np.sin(2*np.pi*(70*np.exp(-2*t)+30)*t)*np.exp(-2.5*t)+0.35*rng.standard_normal(len(t))*np.exp(-6*t))
# floating sparkles 6-10
for tt in np.arange(6.0,10.0,0.22): add(tt,tone(rng.choice([1046,1318,1568,2093]),0.35,0.07,10))
# reverse sweep 10-13 (noise)
d=3.0; t=np.arange(int(d*sr))/sr; add(10.0,0.12*rng.standard_normal(len(t))*(t/d)**2*np.sin(2*np.pi*(2+6*t/d)*t)**2)
# thud at 13
d=0.8; t=np.arange(int(d*sr))/sr; add(13.0,0.7*np.sin(2*np.pi*60*t)*np.exp(-7*t))
y=y/np.max(np.abs(y))*0.85
w=wave.open(sys.argv[1] if len(sys.argv)>1 else 'sound.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
w.writeframes((y*32767).astype(np.int16).tobytes()); w.close(); print("ok")
