// TD geçişi (Faz 5) sonrası: önizleme rotası ana /world'e yönlenir.
// (?monsters=1 grid aracı gerekirse git geçmişinden geri alınabilir.)
import { redirect } from 'next/navigation';
export default function WorldTestnetRedirect() { redirect('/world'); }
