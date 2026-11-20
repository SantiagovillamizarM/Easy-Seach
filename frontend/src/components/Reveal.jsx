import { useReveal } from "../lib/motion.js";

/**
 * Envuelve contenido que aparece (fundido + subida corta) al entrar en pantalla.
 * - `index` escalona elementos de una lista (80 ms entre cada uno).
 * - `scale` añade una leve escala 0.96 → 1 (tarjetas bento).
 * Con movimiento reducido o sin JavaScript el contenido se ve directamente.
 */
export default function Reveal({ as: Tag = "div", index = 0, scale = false, className = "", style, children, ...rest }) {
  const ref = useReveal();
  return (
    <Tag
      ref={ref}
      className={`reveal ${scale ? "reveal-scale" : ""} ${className}`}
      style={{ "--i": index, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
