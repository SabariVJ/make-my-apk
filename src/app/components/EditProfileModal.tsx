import React, { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import { X, Check, Crown, User, MapPin, Camera, Upload, Trash2, Mail, Loader2 } from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { INITIAL_USER } from "../data/initialData";
import { AvatarCropEditor } from "./AvatarCropEditor";
import { supabase } from "@/integrations/supabase/client";
import { saveMyProfile } from "@/lib/profile.functions";

function ownedAvatarPath(url: string | null, userId: string): string | null {
  if (!url) return null;
  const marker = "/avatars/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;
  const path = url.slice(markerIndex + marker.length).split(/[?#]/, 1)[0];
  return path.startsWith(`${userId}/`) ? path : null;
}

export const EditProfileModal: React.FC = () => {
  const {
    user,
    isEditProfileOpen,
    setIsEditProfileOpen,
    updateUserProfile,
    setIsGoogleAuthModalOpen,
  } = useSVJ();
  const callSaveProfile = useServerFn(saveMyProfile);
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio);
  const [location, setLocation] = useState(user.location || "");
  const [avatarPreview, setAvatarPreview] = useState(user.avatar);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar || null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditProfileOpen) return;
    setName(user.name);
    setUsername(user.username);
    setBio(user.bio);
    setLocation(user.location || "");
    setAvatarPreview(user.avatar);
    setAvatarUrl(user.avatar || null);
    setAvatarChanged(false);
    setCropFile(null);
    setError(null);
  }, [isEditProfileOpen, user]);

  if (!isEditProfileOpen) return null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Photo size must be 10MB or less.");
      return;
    }
    setError(null);
    setCropFile(file);
  };

  const uploadCroppedAvatar = async (photo: Blob) => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (authError || !userId) throw new Error("Please sign in again before changing your photo.");
    const path = `${userId}/avatar-${Date.now()}.webp`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, photo, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const cacheBustedUrl = `${data.publicUrl}?v=${Date.now()}`;
    setAvatarPreview(cacheBustedUrl);
    setAvatarUrl(cacheBustedUrl);
    setAvatarChanged(true);
    setCropFile(null);
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview(INITIAL_USER.avatar);
    setAvatarUrl(null);
    setAvatarChanged(true);
    setError(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const oldOwnedPath = avatarChanged ? ownedAvatarPath(user.avatar, user.id) : null;
      const saved = await callSaveProfile({
        data: {
          displayName: name,
          username,
          bio,
          location,
          avatarUrl,
          avatarChanged,
        },
      });
      const nextAvatar = saved.avatarUrl || INITIAL_USER.avatar;
      updateUserProfile({
        name: saved.displayName,
        username: saved.username,
        bio: saved.bio || "",
        location: saved.location || "",
        avatar: nextAvatar,
      });
      if (
        avatarChanged &&
        oldOwnedPath &&
        oldOwnedPath !== ownedAvatarPath(saved.avatarUrl, user.id)
      ) {
        await supabase.storage.from("avatars").remove([oldOwnedPath]);
      }
      setIsEditProfileOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Profile save failed. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative my-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#17171A] p-6 text-[#F4F2ED] shadow-2xl"
        >
          <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-[#C81E3A]" />
              <h2 className="font-anton text-xl uppercase tracking-wide text-white">
                Edit Profile
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsEditProfileOpen(false)}
              disabled={saving}
              className="cursor-pointer rounded-full bg-white/5 p-1.5 text-[#8C8C90] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              aria-label="Close profile editor"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
            <div className="flex flex-col items-center justify-center pb-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <div className="relative group">
                <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-[#C81E3A] bg-[#0B0B0C] p-0.5 shadow-lg shadow-[#C81E3A]/20">
                  <img
                    src={avatarPreview || INITIAL_USER.avatar}
                    alt="Profile avatar"
                    className="h-full w-full rounded-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Camera className="h-6 w-6 text-[#C81E3A]" />
                  <span className="text-[10px] font-mono font-bold uppercase">Change</span>
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-mono text-xs text-white transition-colors hover:bg-white/20"
                >
                  <Upload className="h-3.5 w-3.5 text-[#C81E3A]" />
                  <span>Upload Photo from Device</span>
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="cursor-pointer rounded-lg bg-red-500/10 p-1.5 text-red-400 transition-colors hover:bg-red-500/20"
                    title="Remove profile photo"
                    aria-label="Remove profile photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-2 text-center text-[10px] font-mono text-[#8C8C90]">
                Crop, reposition, zoom, and preview before saving.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-[#8C8C90]">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                className="w-full rounded-xl border border-white/10 bg-[#0B0B0C] px-3.5 py-2.5 font-inter text-sm text-white transition-colors focus:border-[#C81E3A] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-[#8C8C90]">
                Handle / Username
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs font-mono text-[#8C8C90]">
                  @
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) =>
                    setUsername(event.target.value.toLowerCase().replace(/\s+/g, "_"))
                  }
                  minLength={3}
                  maxLength={30}
                  pattern="[a-z0-9_]{3,30}"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0B0C] py-2.5 pl-8 pr-3.5 font-mono text-sm text-white transition-colors focus:border-[#C81E3A] focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-[#8C8C90]">
                Bio & Motivation
              </label>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={280}
                rows={2}
                className="w-full resize-none rounded-xl border border-white/10 bg-[#0B0B0C] px-3.5 py-2.5 font-inter text-sm text-white transition-colors focus:border-[#C81E3A] focus:outline-none"
              />
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-[#0B0B0C] p-3.5">
              <label className="flex items-center justify-between text-[10px] font-mono uppercase text-[#8C8C90]">
                <span>Profile Aura Frame</span>
                <span className="font-bold text-amber-400">
                  {user.equippedFrame
                    ? user.equippedFrame.replace("frame-", "").toUpperCase()
                    : "DEFAULT"}
                </span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: "", label: "None", color: "border-white/20" },
                  { id: "frame-crimson", label: "Crimson", color: "border-[#C81E3A]" },
                  { id: "frame-gold", label: "Gold", color: "border-amber-400" },
                  { id: "frame-cyber", label: "Cyber", color: "border-cyan-400" },
                ].map((frame) => {
                  const selected = (user.equippedFrame || "") === frame.id;
                  return (
                    <button
                      key={frame.id}
                      type="button"
                      onClick={() => updateUserProfile({ equippedFrame: frame.id })}
                      className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] font-mono font-bold transition-all ${
                        selected
                          ? `${frame.color} bg-white/10 text-white ring-1 ring-white/50`
                          : "border-white/10 text-[#8C8C90] hover:border-white/30 hover:text-white"
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full border ${frame.color}`} />
                      <span>{frame.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-[#8C8C90]">
                Location
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3 h-4 w-4 text-[#8C8C90]" />
                <input
                  type="text"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  maxLength={100}
                  placeholder="e.g. Mumbai, India"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0B0C] py-2.5 pl-10 pr-3.5 font-inter text-sm text-white transition-colors focus:border-[#C81E3A] focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-[#0B0B0C] p-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[10px] font-mono uppercase text-[#8C8C90]">
                  <Mail className="h-3 w-3 text-[#C81E3A]" /> Google / Gmail Cloud Account
                </span>
                {user.isFounder && (
                  <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[9px] font-mono font-bold text-amber-400">
                    <Crown className="h-2.5 w-2.5" /> Founder
                  </span>
                )}
              </div>
              {user.email ? (
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="truncate font-bold text-white">{user.email}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditProfileOpen(false);
                      setIsGoogleAuthModalOpen(true);
                    }}
                    className="cursor-pointer text-[10px] text-[#C81E3A] hover:underline"
                  >
                    Manage
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditProfileOpen(false);
                    setIsGoogleAuthModalOpen(true);
                  }}
                  className="w-full cursor-pointer rounded-lg border border-white/10 bg-white/5 py-2 font-mono text-xs text-white transition-colors hover:bg-white/10"
                >
                  Link Gmail for Cloud Sync
                </button>
              )}
            </div>

            {error && (
              <p role="alert" className="text-xs font-mono text-rose-400">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C81E3A] py-3 font-anton uppercase tracking-wider text-white shadow-lg shadow-[#C81E3A]/20 transition-colors hover:bg-[#A0182E] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span>{saving ? "Saving…" : "Save Profile Changes"}</span>
            </button>
          </form>
        </motion.div>
      </div>
      {cropFile && (
        <AvatarCropEditor
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onUsePhoto={uploadCroppedAvatar}
        />
      )}
    </AnimatePresence>
  );
};
