import { useEffect, useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { ROOM_IMAGES_MAX_COUNT } from '../../api';

type Props = {
  imageUrls: string[];
  files: File[];
  disabled: boolean;
  onImagesChange: (urls: string[]) => void;
  onFilesChange: (files: File[]) => void;
};

export default function RoomPhotoEditor({ imageUrls, files, disabled, onImagesChange, onFilesChange }: Props) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState('');
  const count = imageUrls.length + files.length;

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  return (
    <section className="room-photo-editor" aria-label="Fotografias da sala" aria-busy={disabled}>
      <strong>Fotografias da sala ({count}/{ROOM_IMAGES_MAX_COUNT})</strong>
      <small>Até 5 fotos. JPG, PNG ou WebP, máximo 5 MB por foto. Recomendado: 1200 × 675 px (16:9). A primeira foto é a capa.</small>
      <div className="room-photo-editor-grid">
        {[...imageUrls, ...previews].map((url, index) => (
          <div className="room-photo-editor-item" key={`${index}-${url}`}>
            <img src={url} alt={`Fotografia ${index + 1} da sala`} />
            <button
              type="button"
              className="secondary-button"
              disabled={disabled}
              aria-label={`Remover fotografia ${index + 1}`}
              onClick={() => {
                setError('');
                if (index < imageUrls.length) onImagesChange(imageUrls.filter((_, i) => i !== index));
                else onFilesChange(files.filter((_, i) => i !== index - imageUrls.length));
              }}
            >
              {disabled ? <LoaderCircle size={16} className="room-photo-spinner" /> : <Trash2 size={16} />}
              Remover
            </button>
          </div>
        ))}
      </div>
      <label>
        {disabled ? 'A guardar fotografias…' : 'Adicionar fotografias'}
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || count >= ROOM_IMAGES_MAX_COUNT}
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            event.target.value = '';
            setError('');
            if (count + selected.length > ROOM_IMAGES_MAX_COUNT) {
              setError('Cada sala pode ter no máximo 5 fotografias. Remove uma foto antes de adicionar mais.');
              return;
            }
            if (selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
              setError('Formato inválido. Usa apenas JPG, PNG ou WebP.');
              return;
            }
            if (selected.some((file) => file.size > 5 * 1024 * 1024)) {
              setError('Cada fotografia pode ter no máximo 5 MB.');
              return;
            }
            onFilesChange([...files, ...selected]);
          }}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}