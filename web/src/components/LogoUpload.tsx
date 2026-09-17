'use client';

import { useRef } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { Button } from './ui';

export async function lerLogotipo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Use um ficheiro PNG ou JPG.');
  const img = await createImageBitmap(file);
  const escala = Math.min(1, 400 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const uri = canvas.toDataURL('image/png');
  if (uri.length > 700_000) throw new Error('O logótipo continua demasiado grande depois de redimensionado.');
  return uri;
}

export function LogoUpload({ value, onChange, onError }: {
  value: string | null; onChange: (v: string | null) => void; onError: (msg: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-line bg-bg">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Logótipo" className="max-h-20 max-w-20 object-contain" />
        ) : (
          <span className="text-xs text-muted">Sem logótipo</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              onChange(await lerLogotipo(f));
            } catch (err) {
              onError((err as Error).message);
            }
          }}
        />
        <Button type="button" variant="secondary" size="sm" onClick={() => ref.current?.click()}>
          <ImageUp className="size-4" /> Escolher imagem
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <Trash2 className="size-4" /> Remover
          </Button>
        )}
      </div>
    </div>
  );
}
