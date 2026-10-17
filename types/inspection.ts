export type InspectionResult = 'ok' | 'ng' | 'error' | 'no_person';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export type Miss = {
  miss_type: string;
  body_part: string;
  severity_level: SeverityLevel;
  /** 検出器・モデルが特定した座標か、推定位置かを区別する。旧レスポンスでは省略可。 */
  bbox_source?: 'detected' | 'fallback';
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};
