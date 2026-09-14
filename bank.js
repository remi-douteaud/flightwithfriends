// All questions, flattened with a stable id (theme:index) so games can be saved and resumed.
import q_lol from './questions/lol.js';
import q_jeux_video from './questions/jeux-video.js';
import q_warcraft from './questions/warcraft.js';
import q_animaux from './questions/animaux.js';
import q_legumes from './questions/legumes.js';
import q_fleurs from './questions/fleurs.js';
import q_celebrites from './questions/celebrites.js';
import q_f1 from './questions/f1.js';
import q_histoire from './questions/histoire.js';
import q_rois_de_france from './questions/rois-de-france.js';
import q_geographie from './questions/geographie.js';
import q_drapeaux from './questions/drapeaux.js';
import q_formes from './questions/formes.js';
import q_litterature from './questions/litterature.js';
import q_harry_potter from './questions/harry-potter.js';
import q_musique_70_90 from './questions/musique-70-90.js';
import q_musique_90_2010 from './questions/musique-90-2010.js';
import q_musique_2010 from './questions/musique-2010.js';
import q_art from './questions/art.js';
import q_internet_fr from './questions/internet-fr.js';
import q_cuisine from './questions/cuisine.js';
import q_cinema from './questions/cinema.js';
import q_seigneur_des_anneaux from './questions/seigneur-des-anneaux.js';
import q_dinosaures from './questions/dinosaures.js';
import q_monde_1444 from './questions/monde-1444.js';

const FILES = {
  'lol': q_lol,
  'jeux-video': q_jeux_video,
  'warcraft': q_warcraft,
  'animaux': q_animaux,
  'legumes': q_legumes,
  'fleurs': q_fleurs,
  'celebrites': q_celebrites,
  'f1': q_f1,
  'histoire': q_histoire,
  'rois-de-france': q_rois_de_france,
  'geographie': q_geographie,
  'drapeaux': q_drapeaux,
  'formes': q_formes,
  'litterature': q_litterature,
  'harry-potter': q_harry_potter,
  'musique-70-90': q_musique_70_90,
  'musique-90-2010': q_musique_90_2010,
  'musique-2010': q_musique_2010,
  'art': q_art,
  'internet-fr': q_internet_fr,
  'cuisine': q_cuisine,
  'cinema': q_cinema,
  'seigneur-des-anneaux': q_seigneur_des_anneaux,
  'dinosaures': q_dinosaures,
  'monde-1444': q_monde_1444,
};

export const BANK = [];
for (const [theme, list] of Object.entries(FILES)) {
  list.forEach((q, i) => BANK.push({ id: theme + ':' + i, theme, ...q }));
}
export const QUESTION_BY_ID = new Map(BANK.map((q) => [q.id, q]));
