let notificationAudio: HTMLAudioElement | null = null;
let ringtoneAudio: HTMLAudioElement | null = null;

export function playNotificationSound() {
  try {
    if (!notificationAudio) {
      notificationAudio = new Audio("/notification.mp3");
      notificationAudio.volume = 0.6;
    }
    notificationAudio.currentTime = 0;
    void notificationAudio.play().catch(() => {
      // Autoplay blocked until user gesture — ignore
    });
  } catch {
    // ignore
  }
}

/** Outgoing call — heard by the caller while ringing. */
export function playOutgoingRingtone() {
  try {
    stopCallRingtone();
    ringtoneAudio = new Audio("/calling.mp3");
    ringtoneAudio.loop = true;
    ringtoneAudio.volume = 0.55;
    void ringtoneAudio.play().catch(() => {
      // Autoplay blocked until user gesture — ignore
    });
  } catch {
    // ignore
  }
}

/** Incoming call — heard by the callee. */
export function playIncomingRingtone() {
  try {
    stopCallRingtone();
    ringtoneAudio = new Audio("/calling.mp3");
    ringtoneAudio.loop = true;
    ringtoneAudio.volume = 0.7;
    void ringtoneAudio.play().catch(() => {
      // Autoplay blocked until user gesture — ignore
    });
  } catch {
    // ignore
  }
}

/** @deprecated Use playOutgoingRingtone or playIncomingRingtone */
export function playCallRingtone() {
  playOutgoingRingtone();
}

export function stopCallRingtone() {
  if (!ringtoneAudio) return;
  ringtoneAudio.pause();
  ringtoneAudio.currentTime = 0;
  ringtoneAudio = null;
}
