package com.athletigo.app;

import android.media.AudioManager;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Route the hardware volume keys to the media stream (STREAM_MUSIC)
        // so they control the metronome / breathing audio directly — the
        // only user-facing volume control (no in-app slider).
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
    }
}
