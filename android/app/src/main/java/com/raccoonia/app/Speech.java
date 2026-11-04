package com.raccoonia.app;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/** Reconhecimento de voz (SpeechRecognizer) e fala (TextToSpeech) do Android, ligados ao JavaScript. */
class Speech {
    interface Js { void run(String js); }

    private final Context ctx;
    private final Js js;
    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer rec;
    private TextToSpeech tts;
    private boolean ttsReady, continuous, wanted;
    private String locale = "pt-BR";

    Speech(Context ctx, Js js) {
        this.ctx = ctx;
        this.js = js;
        tts = new TextToSpeech(ctx, status -> ttsReady = status == TextToSpeech.SUCCESS);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) { js.run("window.__raccoonSpeechDone && window.__raccoonSpeechDone()"); }
            @Override public void onError(String id) { onDone(id); }
        });
    }

    private void emit(String type, String text) {
        js.run("window.__raccoonSpeech && window.__raccoonSpeech({type:" + JSONObject.quote(type) + ",text:" + JSONObject.quote(text == null ? "" : text) + "})");
    }

    void listen(String locale, boolean continuous) {
        if (!SpeechRecognizer.isRecognitionAvailable(ctx)) { emit("error", "Reconhecimento de voz indisponível neste aparelho"); return; }
        this.locale = locale;
        this.continuous = continuous;
        this.wanted = true;
        if (rec == null) {
            rec = SpeechRecognizer.createSpeechRecognizer(ctx);
            rec.setRecognitionListener(listener);
        } else rec.cancel();
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        rec.startListening(i);
    }

    void stop() {
        wanted = false;
        if (rec != null) rec.cancel();
        emit("end", "");
    }

    private void restartLater() {
        // modo mãos-livres: o Android para de ouvir após cada frase, então reabrimos
        if (wanted && continuous) main.postDelayed(() -> { if (wanted) listen(locale, true); }, 250);
        else emit("end", "");
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle b) { emit("start", ""); }
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float v) {}
        @Override public void onBufferReceived(byte[] b) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onEvent(int t, Bundle b) {}
        @Override public void onPartialResults(Bundle b) {
            ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (r != null && !r.isEmpty() && !r.get(0).isEmpty()) emit("interim", r.get(0));
        }
        @Override public void onResults(Bundle b) {
            ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (r != null && !r.isEmpty()) emit("final", r.get(0));
            if (!continuous) wanted = false;
            restartLater();
        }
        @Override public void onError(int error) {
            if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) { wanted = false; emit("error", "denied"); return; }
            boolean quiet = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                    || error == SpeechRecognizer.ERROR_CLIENT || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY;
            if (!quiet) emit("error", "código " + error);
            if (!continuous) wanted = false;
            restartLater();
        }
    };

    void speak(String text, String locale) {
        if (!ttsReady) { js.run("window.__raccoonSpeechDone && window.__raccoonSpeechDone()"); return; }
        tts.setLanguage(Locale.forLanguageTag(locale));
        tts.setPitch(0.95f);
        tts.setSpeechRate(1.05f);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "raccoon");
    }

    void stopSpeaking() { if (tts != null) tts.stop(); }

    void destroy() {
        wanted = false;
        if (rec != null) rec.destroy();
        if (tts != null) tts.shutdown();
    }
}
