Fine-grained acoustic analysis (chroma vs. mel).

Example: a piano-target edit on ZoME-Bench segment -FlvaZQOr2I_seg001.

Files:
  source.wav       Original input audio.
  sdeedit.wav      SDEdit baseline at edit strength sigma = 0.42.
  ours_uncond.wav  AnchorSteer (unconditioned concept injection) at sigma = 0.55.

The two sigmas are tuned so both methods apply a comparable edit magnitude,
making the chroma / mel analysis in src/chroma_analysis/ a fair comparison.
