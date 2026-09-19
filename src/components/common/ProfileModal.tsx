import { useState, useRef } from 'react';
import { X, User, Plus } from '@phosphor-icons/react';
import { Tooltip } from './Tooltip';
import { AtInput } from './AtInput';
import { btn, iconBtn } from './btn';
import { api } from '../../lib/api';
import { useAuth } from '../../store/useAuth';
import { toast } from '../../store/useToast';
import { MAX_PHOTO_BYTES } from '../../lib/photoUpload';
import { normalizeGalleryId } from '../../lib/url';

const SOCIAL_PLATFORMS = [
  { key: 'patreon',  label: 'Patreon',    placeholder: 'https://patreon.com/you' },
  { key: 'tumblr',   label: 'Tumblr',     placeholder: 'https://yourname.tumblr.com' },
  { key: 'twitter',  label: 'Twitter / X', placeholder: 'https://x.com/yourname' },
  { key: 'youtube',  label: 'YouTube',    placeholder: 'https://youtube.com/@you' },
  { key: 'tiktok',   label: 'TikTok',     placeholder: 'https://tiktok.com/@you' },
  { key: 'twitch',   label: 'Twitch',     placeholder: 'https://twitch.tv/yourname' },
  { key: 'reddit',   label: 'Reddit',     placeholder: 'https://reddit.com/u/yourname' },
  { key: 'other',    label: 'Other',      placeholder: 'https://yoursite.com' },
] as const;

/**
 * The account window: who you are publicly (Creator) and the two things you can
 * change about the account itself (Account).
 *
 * It lives here rather than inside the top bar because the top bar only exists
 * inside a save — which left an account with no saves yet with no way to reach
 * its own password. Both the top bar and the save-file picker render this one.
 *
 * Mounted only while open, so its fields seed from the current user on open and
 * a cancelled edit leaves nothing behind.
 */
export function ProfileModal({ onClose }: { onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const updateProfile = useAuth((s) => s.updateProfile);
  const changePassword = useAuth((s) => s.changePassword);
  const uploadProfilePhoto = useAuth((s) => s.uploadProfilePhoto);

  const [tab, setTab] = useState<'account' | 'creator'>('creator');

  // Render the avatar via the same authenticated proxy every other photo uses
  // (api.photoUrl), not the server-built direct R2 URL — the direct URL doesn't
  // resolve in every environment, which is why it looked broken after a reload.
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(
    user?.profilePhotoFilename ? api.photoUrl(user.profilePhotoFilename, 128) : null,
  );
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [creatorName, setCreatorName] = useState(user?.creatorName ?? '');
  // Heal an already-saved Gallery value on open rather than waiting for someone
  // to edit that one field. Accounts created before this was a username field
  // hold things like "https://@imanistan", and the point is that nobody should
  // have to notice.
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(() => {
    const links = { ...(user?.socialLinks ?? {}) };
    if (links['gallery']) links['gallery'] = normalizeGalleryId(links['gallery']);
    return links;
  });

  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Screened at PICK time, not at save time — this one stages a preview and
    // uploads later, so a file that was never going to work should be rejected
    // while you can still see what you chose.
    if (!file.type.startsWith('image/')) { toast(`${file.name} isn't an image.`); return; }
    if (file.size > MAX_PHOTO_BYTES) {
      toast(`${file.name} is too large — ${Math.round(file.size / 1024 / 1024)}MB, and the limit is ${MAX_PHOTO_BYTES / 1024 / 1024}MB.`);
      return;
    }
    setProfilePhotoFile(file);
    setProfilePhotoPreview(URL.createObjectURL(file));
  }

  async function saveCreatorTab() {
    setProfileSaving(true);
    try {
      if (profilePhotoFile) {
        const fd = new FormData();
        fd.append('photo', profilePhotoFile);
        await uploadProfilePhoto(fd);
        setProfilePhotoFile(null);
      }
      await updateProfile({
        creatorName: creatorName.trim() || null,
        socialLinks,
      });
    } catch (err) {
      // Was bare try/finally: a failed save just stopped the spinner, leaving
      // the modal looking exactly as it does on success.
      console.error('[profile] save failed:', err);
      toast("Couldn't save your profile. Try again in a moment.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError('');
    setPasswordSuccess(false);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All password fields are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
    } catch (err) {
      setPasswordError((err as Error).message);
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-c-card border border-c-border rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">

        <div className="px-5 pt-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-c-text tracking-headline m-0">Profile</h2>
          <button onClick={onClose} aria-label="Close" className={iconBtn(8)}>
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-c-border px-5 pt-3 gap-1">
          {(['creator', 'account'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-2xs font-bold uppercase tracking-label px-3 py-2 rounded-t-lg transition-colors border-b-2 -mb-px cursor-pointer ${
                tab === t
                  ? 'border-c-accent text-c-green'
                  : 'border-transparent text-c-muted hover:text-c-text'
              }`}
            >
              {t === 'account' ? 'Account' : 'Creator'}
            </button>
          ))}
        </div>

        <div className="p-5 flex flex-col gap-5 overflow-y-auto flex-1 bg-c-base">

          {tab === 'creator' && (
            <>
              {/* Profile photo + creator name */}
              <div className="flex items-start gap-4">
                <Tooltip text="Change profile photo">
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-c-border hover:border-c-accent transition-colors shrink-0 group" aria-label="Change profile photo">
                    {profilePhotoPreview ? (
                      <img src={profilePhotoPreview} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-c-panel flex items-center justify-center text-c-dim">
                        <User size={28} weight="duotone" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Plus size={16} weight="bold" />
                    </div>
                  </button>
                </Tooltip>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <label className="text-xs font-medium text-c-muted">Creator name</label>
                  <input
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    placeholder="Your Sims creator name"
                    className="border border-c-border rounded-lg px-3 py-2 text-sm text-c-text focus:outline-none focus:border-c-accent bg-c-card placeholder:text-c-faint"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-c-muted">Sims Gallery ID</label>
                {/* The @ carries the meaning that a helper line used to: this is a
                    handle, not an address. It sat as a plain box under a column
                    of URL fields, so people pasted URLs into it. */}
                <AtInput
                  value={socialLinks['gallery'] ?? ''}
                  onChange={(v) => setSocialLinks((prev) => ({ ...prev, gallery: v }))}
                  onBlur={() => setSocialLinks((prev) => ({ ...prev, gallery: normalizeGalleryId(prev['gallery']) }))}
                  placeholder="yourgalleryname"
                  tone="card"
                />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-2xs font-bold uppercase tracking-label text-c-dim m-0">Social links</p>
                {SOCIAL_PLATFORMS.map(({ key, label, placeholder }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="text-xs font-medium text-c-muted w-20 shrink-0">{label}</label>
                    <input
                      value={socialLinks[key] ?? ''}
                      onChange={(e) => setSocialLinks((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="flex-1 min-w-0 border border-c-border rounded-lg px-3 py-2 text-sm text-c-text focus:outline-none focus:border-c-accent bg-c-card placeholder:text-c-faint"
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'account' && (
            <>
              {/* Email (read-only) */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-c-muted">Email</p>
                <p className="text-sm text-c-text bg-c-card border border-c-border rounded-lg px-3 py-2 select-all m-0">
                  {user?.email}
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-c-border" />

              {/* Change password */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium text-c-muted">Change password</p>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  className="border border-c-border rounded-lg px-3 py-2 text-sm text-c-text focus:outline-none focus:border-c-accent bg-c-card placeholder:text-c-faint"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  className="border border-c-border rounded-lg px-3 py-2 text-sm text-c-text focus:outline-none focus:border-c-accent bg-c-card placeholder:text-c-faint"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="border border-c-border rounded-lg px-3 py-2 text-sm text-c-text focus:outline-none focus:border-c-accent bg-c-card placeholder:text-c-faint"
                />
                {passwordError && <p className="text-2xs font-semibold text-c-red">{passwordError}</p>}
                {passwordSuccess && <p className="text-2xs font-semibold text-c-green">Password changed successfully.</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={onClose} className="text-xs text-c-muted hover:text-c-text px-4 py-2 rounded-lg border border-c-border transition-colors">
                    Close
                  </button>
                  <button
                    onClick={handleChangePassword}
                    disabled={passwordSaving}
                    className={btn('secondary', { size: 'sm' })}
                  >
                    {passwordSaving ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </div>
            </>
          )}

        </div>

        {tab === 'creator' && (
          <div className="px-5 py-3 border-t border-c-border flex items-center justify-end gap-2 shrink-0">
            <button onClick={onClose} className={btn('ghost')}>Cancel</button>
            <button onClick={saveCreatorTab} disabled={profileSaving} className={btn('primary')}>
              {profileSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
