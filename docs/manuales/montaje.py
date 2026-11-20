import sys
from PIL import Image
d='C:/Users/Aleja/El mana-puestos/docs/manuales/img/'
names=sys.argv[1:]
ims=[Image.open(d+n+'.png').convert('RGB').resize((683,384)) for n in names]
cols=2; rows=(len(ims)+1)//2
S=Image.new('RGB',(683*cols,384*rows),'white')
for i,im in enumerate(ims): S.paste(im,((i%cols)*683,(i//cols)*384))
S.save('C:/Users/Aleja/AppData/Local/Temp/claude/543f549193a8f799/ca08ed5b-3769-4fbc-b2d5-80a60754ed88/scratchpad/m.png')
