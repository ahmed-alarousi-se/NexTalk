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

export function playCallRingtone() {
  try {
    stopCallRingtone();
    ringtoneAudio = new Audio("/calling_resaved.mp3");
    ringtoneAudio.loop = true;
    ringtoneAudio.volume = 0.55;
    void ringtoneAudio.play().catch(() => {
      // Autoplay blocked until user gesture — ignore
    });
  } catch {
    // ignore
  }
}

export function stopCallRingtone() {
  if (!ringtoneAudio) return;
  ringtoneAudio.pause();
  ringtoneAudio.currentTime = 0;
  ringtoneAudio = null;
}
