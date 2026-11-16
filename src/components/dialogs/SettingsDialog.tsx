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
      title="设置"
      description="外观与本地文件行为。所有设置都只保存在这台设备上。"
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="button" className="primary-button" onClick={save}>保存设置</button>
        </>
      }
    >
      <section className="settings-section">
        <h3>外观</h3>
        <p>白色与深色模式都遵循同一套黑白视觉语言。</p>
        <div className="settings-choice">
          {([
            ['system', '跟随系统', Monitor],
            ['light', '白色', Sun],
            ['dark', '深色', Moon],
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
        <h3>编辑</h3>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>编辑区字号</strong>
            <span>改动会立即应用到当前文档</span>
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
            <strong>同步滚动</strong>
            <span>在分屏模式中保持编辑区与预览成对滚动</span>
          </div>
          <button
            type="button"
            className="toggle-switch"
            role="switch"
            aria-checked={syncScroll}
            aria-label="同步滚动"
            onClick={() => setSyncScroll((value) => !value)}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3>图片与附件</h3>
        <p>粘贴截图时，图片会写入当前工作区的这个相对目录，并插入对应的 Markdown 路径。</p>
        <div className="form-field">
          <label htmlFor="settings-image-directory">本地图片目录</label>
          <input
            id="settings-image-directory"
            value={imageDirectory}
            placeholder="assets"
            onChange={(event) => setImageDirectory(event.target.value)}
          />
          <span className="form-hint">
            默认 `assets`。浏览器安全限制下，路径会落在当前打开的文件夹内。
          </span>
        </div>
      </section>

      <section className="settings-section">
        <h3>本地优先</h3>
        <p>
          Markdown studio 不连接云端服务。你的文档写入本地文件夹；浏览器只保存主题、字号等偏好设置。
        </p>
      </section>
    </Modal>
  );
}
