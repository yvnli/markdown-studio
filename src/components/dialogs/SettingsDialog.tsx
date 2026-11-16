import { useState } from 'react';
import { Monitor, Moon, Sun, Type } from 'lucide-react';
import { usePreferencesStore } from '../../app/preferencesStore';
import type { Appearance } from '../../types/document';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const preferences = usePreferencesStore();
  const [appearance, setAppearance] = useState<Appearance>(preferences.appearance);
  const [fontSize, setFontSize] = useState(preferences.fontSize);
  const [imageDirectory, setImageDirectory] = useState(preferences.imageDirectory);
  const [syncScroll, setSyncScroll] = useState(preferences.syncScroll);

  const save = () => {
    preferences.setAppearance(appearance);
    preferences.setFontSize(fontSize);
    preferences.setImageDirectory(imageDirectory.trim() || 'assets');
    preferences.setSyncScroll(syncScroll);
    onClose();
  };

  return (
    <Modal
      title="Settings"
      description="Appearance and local file behavior. All settings stay on this device."
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" onClick={save}>Save settings</button>
        </>
      }
    >
      <section className="settings-section">
        <h3>Appearance</h3>
        <p>Light and dark mode share the same black-and-white visual language.</p>
        <div className="settings-choice">
          {([
            ['system', 'System', Monitor],
            ['light', 'Light', Sun],
            ['dark', 'Dark', Moon],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              className={cn(appearance === value && 'is-selected')}
              onClick={() => setAppearance(value)}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Editor</h3>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>Editor font size</strong>
            <span>Changes apply immediately to the current document</span>
          </div>
          <label className="font-size-select">
            <Type size={13} />
            <select value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))}>
              {[13, 14, 15, 16, 17].map((size) => (
                <option key={size} value={size}>{size} px</option>
              ))}
            </select>
          </label>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>Sync scrolling</strong>
            <span>Keep the editor and preview scrolling together in Split view</span>
          </div>
          <button
            type="button"
            className="toggle-switch"
            role="switch"
            aria-checked={syncScroll}
            aria-label="Sync scrolling"
            onClick={() => setSyncScroll((value) => !value)}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3>Images &amp; attachments</h3>
        <p>When you paste a screenshot, the image is saved to this folder in the workspace and its Markdown path is inserted.</p>
        <div className="form-field">
          <label htmlFor="settings-image-directory">Local image folder</label>
          <input
            id="settings-image-directory"
            value={imageDirectory}
            placeholder="assets"
            onChange={(event) => setImageDirectory(event.target.value)}
          />
          <span className="form-hint">
            Defaults to `assets`. Browser security keeps the path inside the open folder.
          </span>
        </div>
      </section>

      <section className="settings-section">
        <h3>Local first</h3>
        <p>
          Markdown studio doesn't connect to cloud services. Your documents are written to local folders; the browser only stores preferences like theme and font size.
        </p>
      </section>
    </Modal>
  );
}
