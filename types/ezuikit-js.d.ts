/**
 * `ezuikit-js` 9.0.23 no publica tipos. Sólo lo que usa el visor de la nube
 * (`components/admin/forestal/camaras/use-visor-nube.ts`, ADR-471); las firmas
 * salen del README del paquete («初始化参数说明» y «方法调用»).
 */
declare module "ezuikit-js" {
  export interface EZUIKitOpciones {
    /** id del contenedor (tiene que existir en el DOM). */
    id: string;
    accessToken: string;
    /** URL EZOPEN (`ezopen://[código@]host/serie/canal.live`). */
    url: string;
    /** Dominio de video de la región; sin él va a China y falla callado. */
    env?: { domain: string };
    template?: "simple" | "standard" | "security" | "pcLive" | "pcRec" | "mobileLive" | "mobileRec";
    width?: number;
    height?: number;
    audio?: boolean;
    language?: "zh" | "en";
    /** Dónde están los decodificadores; ABSOLUTA (el worker ignora una relativa y va al CDN de EZVIZ). */
    staticPath?: string;
    /**
     * Reconexión propia del flujo cuando se corta con el video ya andando
     * (defaults del bundle 9.0.23: `{ enabled: true, maxRetry: 1, retryDelay: 1500,
     * dataTimeout: 10000, dataCheckInterval: 10000 }`). No cubre la falla del arranque.
     */
    reconnect?: { enabled?: boolean; maxRetry?: number; retryDelay?: number; dataTimeout?: number; dataCheckInterval?: number };
    handleSuccess?: () => void;
    handleError?: (err: unknown) => void;
  }

  export class EZUIKitPlayer {
    constructor(opciones: EZUIKitOpciones);
    play(): Promise<unknown> | void;
    stop(): Promise<unknown> | void;
    destroy(): Promise<unknown> | void;
    fullScreen?(): Promise<unknown> | void;
    capturePicture?(nombre?: string, cb?: (datos: unknown) => void): Promise<unknown> | void;
    resize?(ancho: number, alto: number): void;
  }

  export default EZUIKitPlayer;
}
