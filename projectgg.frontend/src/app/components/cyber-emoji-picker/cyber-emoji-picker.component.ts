import { Component, EventEmitter, Output, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  emojis: string[];
}

@Component({
  selector: 'app-cyber-emoji-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="picker" (click)="$event.stopPropagation()">
      <div class="picker-header">
        <span class="picker-title">Emoji & more</span>
        <div class="picker-tabs">
          @for (cat of categories; track cat.id) {
            <button class="picker-tab" [class.active]="activeTab === cat.id" (click)="activeTab = cat.id">
              <span class="tab-icon">{{ cat.icon }}</span>
            </button>
          }
        </div>
      </div>

      <div class="picker-body">
        @for (cat of visibleCategories; track cat.id) {
          <div class="emoji-section">
            <div class="section-label">{{ cat.label }}</div>
            <div class="emoji-grid">
              @for (emoji of cat.emojis; track emoji) {
                <button class="emoji-btn" (click)="select(emoji)" (mouseenter)="hoveredEmoji = emoji">
                  <span class="emoji-char">{{ emoji }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>

      @if (hoveredEmoji) {
        <div class="picker-footer">
          <span class="footer-emoji">{{ hoveredEmoji }}</span>
          <span class="footer-label">{{ getEmojiName(hoveredEmoji) }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .picker {
      width: 350px;
      max-height: 420px;
      background: #2b2d31;
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      font-family: 'gg', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    /* ── HEADER ── */
    .picker-header {
      padding: 10px 12px 0;
    }

    .picker-title {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: #b5bac1;
      margin-bottom: 8px;
    }

    .picker-tabs {
      display: flex;
      gap: 2px;
    }

    .picker-tab {
      flex: 1;
      padding: 6px 0;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: #80848e;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .picker-tab:hover { color: #dbdee1; }
    .picker-tab.active {
      color: #fff;
      border-bottom-color: #5865f2;
    }

    .tab-icon { font-size: 18px; }

    /* ── BODY ── */
    .picker-body {
      flex: 1;
      overflow-y: auto;
      padding: 0 12px;

      &::-webkit-scrollbar { width: 6px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb { background: #1a1b1e; border-radius: 3px; }
    }

    .emoji-section { margin-bottom: 8px; }

    .section-label {
      font-size: 11px;
      font-weight: 700;
      color: #80848e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 6px 0 4px;
      position: sticky;
      top: 0;
      background: #2b2d31;
      z-index: 1;
    }

    .emoji-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0;
    }

    .emoji-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.1s;
      position: relative;
    }

    .emoji-btn:hover {
      background: rgba(88, 101, 242, 0.15);
      border-radius: 5px;
    }

    .emoji-btn:hover .emoji-char {
      transform: scale(1.15);
    }

    .emoji-char {
      font-size: 22px;
      transition: transform 0.1s;
      line-height: 1;
    }

    /* ── FOOTER ── */
    .picker-footer {
      padding: 8px 12px;
      background: #2b2d31;
      border-top: 1px solid #1e1f22;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .footer-emoji { font-size: 22px; }
    .footer-label {
      font-size: 12px;
      color: #80848e;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `],
})
export class CyberEmojiPickerComponent implements OnInit {
  @Output() emojiSelect = new EventEmitter<string>();

  activeTab = 'emoji';
  hoveredEmoji = '';

  emojiNameMap: Record<string, string> = {
    '😀':'grinning face','😃':'grinning face with big eyes','😄':'grinning face with smiling eyes','😁':'beaming face with smiling eyes','😆':'grinning squinting face','😅':'grinning face with sweat','🤣':'rolling on the floor laughing','😂':'face with tears of joy','🙂':'slightly smiling face','🙃':'upside-down face','😉':'winking face','😊':'smiling face with smiling eyes','😇':'smiling face with halo','🥰':'smiling face with hearts','😍':'smiling face with heart-eyes','🤩':'star-struck','😘':'face blowing a kiss','😗':'kissing face','😚':'kissing face with closed eyes','😙':'kissing face with smiling eyes','🥲':'smiling face with tear','😋':'face savoring food','😛':'face with tongue','😜':'winking face with tongue','🤪':'zany face','😝':'squinting face with tongue','🤑':'money-mouth face','🤗':'hugging face','🤭':'face with hand over mouth','🫢':'face with open eyes and hand over mouth','🤫':'shushing face','🤔':'thinking face','🫡':'saluting face','🤐':'zipper-mouth face','🤨':'face with raised eyebrow','😐':'neutral face','😑':'expressionless face','😶':'face without mouth','🫥':'dotted line face','😏':'smirking face','😒':'unamused face','🙄':'face with rolling eyes','😬':'grimacing face','🤥':'lying face','😌':'relieved face','😔':'pensive face','😪':'sleepy face','🤤':'drooling face','😴':'sleeping face','😷':'face with medical mask','🤒':'face with thermometer','🤕':'face with head-bandage','🤢':'nauseated face','🤮':'face vomiting','🥵':'hot face','🥶':'cold face','🥴':'woozy face','😵':'dizzy face','🤯':'exploding head','🤠':'cowboy hat face','🥳':'partying face','🥸':'disguised face','😎':'smiling face with sunglasses','🤓':'nerd face','🧐':'face with monocle','😕':'confused face','🫤':'face with diagonal mouth','😟':'worried face','🙁':'slightly frowning face','☹️':'frowning face','😮':'face with open mouth','😯':'hushed face','😲':'astonished face','😳':'flushed face','🥺':'pleading face','🥹':'face holding back tears','😦':'frowning face with open mouth','😧':'anguished face','😨':'fearful face','😰':'anxious face with sweat','😥':'sad but relieved face','😢':'crying face','😭':'loudly crying face','😱':'face screaming in fear','😖':'confounded face','😣':'persevering face','😞':'disappointed face','😓':'downcast face with sweat','😩':'weary face','😫':'tired face','🥱':'yawning face','😤':'face with steam from nose','😡':'pouting face','😠':'angry face','🤬':'face with medical symbols','😈':'smiling face with horns','👿':'angry face with horns','💀':'skull','☠️':'skull and crossbones','💩':'pile of poo','🤡':'clown face','👹':'ogre','👺':'goblin','👻':'ghost','👽':'alien','👾':'alien monster','🤖':'robot','😺':'grinning cat','😸':'grinning cat with smiling eyes','😹':'cat with tears of joy','😻':'smiling cat with heart-eyes','😼':'cat with wry smile','😽':'kissing cat','🙀':'weary cat','😿':'crying cat','😾':'pouting cat','🫶':'heart hands','🫰':'hand with index finger and thumb crossed','🫱':'rightwards hand','🫲':'leftwards hand','👋':'waving hand','🤚':'raised back of hand','🖐️':'hand with fingers splayed','✋':'raised hand','🖖':'vulcan salute','👌':'OK hand','🤌':'pinched fingers','🤏':'pinching hand','✌️':'victory hand','🤞':'crossed fingers','🤟':'love-you gesture','🤘':'sign of the horns','🤙':'call me hand','👈':'backhand index pointing left','👉':'backhand index pointing right','👆':'backhand index pointing up','🖕':'middle finger','👇':'backhand index pointing down','☝️':'index pointing up','🫵':'index pointing at the viewer','👍':'thumbs up','👎':'thumbs down','✊':'raised fist','👊':'oncoming fist','🤛':'left-facing fist','🤜':'right-facing fist','👏':'clapping hands','🙌':'raising hands','👐':'open hands','🤲':'palms up together','🤝':'handshake','🙏':'folded hands','💪':'flexed biceps','🦾':'mechanical arm','🦿':'mechanical leg','🦵':'leg','🦶':'foot','👂':'ear',
    '🐶':'dog face','🐱':'cat face','🐭':'mouse face','🐹':'hamster','🐰':'rabbit face','🦊':'fox','🐻':'bear','🐼':'panda','🐻‍❄️':'polar bear','🐨':'koala','🐯':'tiger face','🦁':'lion','🐮':'cow face','🐷':'pig face','🐸':'frog','🐵':'monkey face','🙈':'see-no-evil monkey','🙉':'hear-no-evil monkey','🙊':'speak-no-evil monkey','🐒':'monkey','🐔':'chicken','🐧':'penguin','🐦':'bird','🐤':'baby chick','🐣':'hatching chick','🦆':'duck','🦅':'eagle','🦉':'owl','🦇':'bat','🐺':'wolf','🐗':'boar','🐴':'horse face','🦄':'unicorn','🐝':'honeybee','🪱':'worm','🐛':'bug','🦋':'butterfly','🐌':'snail','🐞':'lady beetle','🐜':'ant','🪰':'fly','🪲':'beetle','🪳':'cockroach','🦟':'mosquito','🦗':'cricket','🕷️':'spider','🦂':'scorpion','🐢':'turtle','🐍':'snake','🦎':'lizard','🦖':'T-Rex','🦕':'sauropod','🐙':'octopus','🦑':'squid','🦐':'shrimp','🦞':'lobster','🦀':'crab','🐡':'blowfish','🐠':'tropical fish','🐟':'fish','🐬':'dolphin','🐳':'spouting whale','🐋':'whale','🦈':'shark','🐊':'crocodile','🐅':'tiger','🐆':'leopard','🦓':'zebra','🦍':'gorilla','🦧':'orangutan','🌺':'hibiscus','🌻':'sunflower','🌹':'rose','🌷':'tulip','🌸':'cherry blossom','💐':'bouquet','🌾':'sheaf of rice','🍀':'four leaf clover','🍁':'maple leaf','🍂':'fallen leaf','🍃':'leaf fluttering in wind','🌿':'herb','☘️':'shamrock','🪴':'potted plant','🌵':'cactus','🌴':'palm tree','🌳':'deciduous tree','🌲':'evergreen tree','🪵':'log','🪨':'rock',
    '🍏':'green apple','🍎':'red apple','🍐':'pear','🍊':'tangerine','🍋':'lemon','🍌':'banana','🍉':'watermelon','🍇':'grapes','🍓':'strawberry','🫐':'blueberries','🍈':'melon','🍒':'cherries','🍑':'peach','🥭':'mango','🍍':'pineapple','🥥':'coconut','🥝':'kiwi','🍅':'tomato','🍆':'eggplant','🥑':'avocado','🥦':'broccoli','🥬':'leafy green','🥒':'cucumber','🌶️':'hot pepper','🫑':'bell pepper','🌽':'corn','🥕':'carrot','🫒':'olive','🧄':'garlic','🧅':'onion','🥔':'potato','🍠':'roasted sweet potato','🥐':'croissant','🥖':'baguette bread','🍞':'bread','🥨':'pretzel','🥚':'egg','🧀':'cheese wedge','🍖':'meat on bone','🍗':'poultry leg','🥩':'cut of meat','🥓':'bacon','🍔':'hamburger','🍟':'french fries','🍕':'pizza','🫓':'flatbread','🥪':'sandwich','🌮':'taco','🌯':'burrito','🫔':'tamale','🥙':'stuffed flatbread','🧆':'falafel','🍳':'cooking','🥘':'shallow pan of food','🍲':'pot of food','🫕':'fondue','🥣':'bowl with spoon','🥗':'green salad','🍿':'popcorn','🧈':'butter','🧂':'salt','🥫':'canned food','🍱':'bento box','🍘':'rice cracker','🍙':'rice ball','🍚':'cooked rice','🍛':'curry rice','🍜':'steaming bowl','🍝':'spaghetti','🍢':'oden','🍣':'sushi','🍤':'fried shrimp','🍥':'fish cake with swirl','🥮':'moon cake','🍡':'dango','🥟':'dumpling','🥠':'fortune cookie','🥡':'takeout box','🍦':'soft ice cream','🍧':'shaved ice','🍨':'ice cream','🍩':'doughnut','🍪':'cookie','🎂':'birthday cake','🍰':'shortcake','🧁':'cupcake','🥧':'pie','🍫':'chocolate','🍬':'candy','🍭':'lollipop','🍮':'custard','🍯':'honey pot','🍼':'baby bottle','🥛':'glass of milk','☕':'hot beverage','🫖':'teapot','🍵':'teacup without handle','🍶':'sake','🍾':'bottle with popping cork','🍷':'wine glass','🍸':'cocktail glass','🍹':'tropical drink','🍺':'beer mug','🍻':'clinking beer mugs','🥂':'clinking glasses','🥃':'tumbler glass','🫗':'pouring liquid','🥤':'cup with straw','🧋':'bubble tea','🧃':'juice box','🧉':'mate','🧊':'ice','🥢':'chopsticks','🍽️':'fork and knife with plate',
    '⚽':'soccer ball','🏀':'basketball','🏈':'american football','⚾':'baseball','🥎':'softball','🎾':'tennis','🏐':'volleyball','🏉':'rugby football','🥏':'flying disc','🎱':'pool 8 ball','🪀':'yo-yo','🏓':'ping pong','🏸':'badminton','🏒':'ice hockey','🏑':'field hockey','🥍':'lacrosse','🏏':'cricket game','🪃':'boomerang','🥅':'goal net','⛳':'flag in hole','🪁':'kite','🏹':'bow and arrow','🎣':'fishing pole','🤿':'diving mask','🥊':'boxing glove','🥋':'martial arts uniform','🎽':'running shirt','🛹':'skateboard','🛼':'roller skate','🛷':'sled','⛸️':'ice skate','🥌':'curling stone','🎿':'skis','🎯':'bullseye','🪩':'mirror ball','🎲':'game die','♟️':'chess pawn','🧩':'puzzle piece','🎭':'performing arts','🎨':'artist palette','🎪':'circus tent','🎤':'microphone','🎧':'headphone','🎼':'musical score','🎹':'musical keyboard','🥁':'drum','🪘':'long drum','🎷':'saxophone','🎺':'trumpet','🪗':'accordion','🎸':'guitar','🪕':'banjo','🎻':'violin','🎮':'video game','🕹️':'joystick','🎰':'slot machine','🏆':'trophy','🏅':'sports medal','🥇':'1st place medal','🥈':'2nd place medal','🥉':'3rd place medal','🎬':'clapper board','🎵':'musical note','🎶':'musical notes',
    '⌚':'watch','📱':'mobile phone','📲':'mobile phone with arrow','💻':'laptop','⌨️':'keyboard','🖥️':'desktop computer','🖨️':'printer','🖱️':'computer mouse','🖲️':'trackball','💽':'computer disk','💾':'floppy disk','💿':'optical disk','📀':'dvd','📼':'videocassette','📷':'camera','📸':'camera with flash','📹':'video camera','🎥':'movie camera','📽️':'film projector','🎞️':'film frames','📞':'telephone receiver','☎️':'telephone','📟':'pager','📠':'fax machine','📺':'television','📻':'radio','🎙️':'studio microphone','🎚️':'level slider','🎛️':'control knobs','🧭':'compass','⏱️':'stopwatch','⏲️':'timer clock','⏰':'alarm clock','🕰️':'mantelpiece clock','⌛':'hourglass done','⏳':'hourglass not done','📡':'satellite antenna','🔋':'battery','🪫':'low battery','🔌':'power plug','💡':'light bulb','🔦':'flashlight','🕯️':'candle','🪔':'diya lamp','🧯':'fire extinguisher','🛢️':'oil drum','💸':'money with wings','💵':'dollar banknote','💴':'yen banknote','💶':'euro banknote','💷':'pound banknote','🪙':'coin','💰':'money bag','💳':'credit card','🪪':'identification card','📦':'package','📫':'closed mailbox with raised flag','📪':'closed mailbox with lowered flag','📬':'open mailbox with raised flag','📭':'open mailbox with lowered flag','📮':'postbox','🗳️':'ballot box with ballot','✏️':'pencil','✒️':'black nib','🖋️':'fountain pen','🖊️':'pen','🖌️':'paintbrush','🖍️':'crayon','📝':'memo','💼':'briefcase','📁':'file folder','📂':'open file folder','🗂️':'card index dividers','📅':'calendar','📆':'tear-off calendar','🗒️':'spiral notepad','🗓️':'spiral calendar','📇':'card index','📈':'chart increasing','📉':'chart decreasing','📊':'bar chart','📋':'clipboard','📌':'pushpin','📍':'round pushpin','📎':'paperclip','🖇️':'linked paperclips','📏':'straight ruler','📐':'triangular ruler','🔑':'key','🗝️':'old key','🔨':'hammer','🪓':'axe','⛏️':'pick','⚒️':'hammer and pick','🛠️':'hammer and wrench','🗡️':'dagger','⚔️':'crossed swords','🔫':'pistol','🛡️':'shield','🔧':'wrench','🪛':'screwdriver','🔩':'nut and bolt','⚙️':'gear','⚖️':'balance scale','🦯':'white cane',
    '❤️':'red heart','🧡':'orange heart','💛':'yellow heart','💚':'green heart','💙':'blue heart','💜':'purple heart','🖤':'black heart','🤍':'white heart','🤎':'brown heart','💔':'broken heart','❤️‍🔥':'heart on fire','❤️‍🩹':'mending heart','❣️':'heart exclamation','💕':'two hearts','💞':'revolving hearts','💓':'beating heart','💗':'growing heart','💖':'sparkling heart','💘':'heart with arrow','💝':'heart with ribbon','💟':'heart decoration','☮️':'peace symbol','✝️':'latin cross','☪️':'star and crescent','🕉️':'om','☸️':'wheel of dharma','✡️':'star of david','🔯':'dotted six-pointed star','🕎':'menorah','☯️':'yin yang','☦️':'orthodox cross','🛐':'place of worship','⛎':'ophiuchus','♈':'aries','♉':'taurus','♊':'gemini','♋':'cancer','♌':'leo','♍':'virgo','♎':'libra','♏':'scorpio','♐':'sagittarius','♑':'capricorn','♒':'aquarius','♓':'pisces','🆔':'ID button','⚛️':'atom symbol','🉑':'acceptable','☢️':'radioactive','☣️':'biohazard','📴':'mobile phone off','📳':'vibration mode','🈶':'Japanese not free of charge','🈚':'Japanese free of charge','🈸':'Japanese application','🈺':'Japanese open for business','🈷️':'Japanese monthly amount','✴️':'eight-pointed star','🆚':'versus','💮':'white flower','🉐':'Japanese bargain','㊙️':'Japanese secret','㊗️':'Japanese congratulations','🈴':'Japanese passing grade','🈵':'Japanese no vacancy','🈹':'Japanese discount','🈲':'Japanese prohibited','🅰️':'A button','🅱️':'B button','🆎':'AB button','🆑':'CL button','🅾️':'O button','🆘':'SOS button','❌':'cross mark','⭕':'hollow red circle','🛑':'stop sign','⛔':'no entry','📛':'name badge','🚫':'prohibited','💯':'hundred points','💢':'anger symbol','♨️':'hot springs','🚷':'no pedestrians','🚯':'no littering','🚳':'no bicycles','🚱':'non-potable water','🔞':'no one under eighteen','📵':'no mobile phones','🚭':'no smoking','❗':'exclamation mark','❕':'white exclamation mark','❓':'question mark','❔':'white question mark','‼️':'double exclamation mark','⁉️':'exclamation question mark','🔅':'dim button','🔆':'bright button','〽️':'part alternation mark','⚠️':'warning','🚸':'children crossing','🔱':'trident emblem','⚜️':'fleur-de-lis','🔰':'Japanese symbol for beginner','♻️':'recycling symbol','✅':'check mark button','🈯':'Japanese reserved button','💹':'chart with upwards trend','❇️':'sparkle','✳️':'eight-spoked asterisk','❎':'cross mark button','🌐':'globe with meridians','💠':'diamond with a dot','Ⓜ️':'circled M','🌀':'cyclone','💤':'zzz','🏧':'ATM sign','🚾':'water closet','♿':'wheelchair symbol','🅿️':'P button','🛗':'elevator','🈳':'Japanese vacancy','🈂️':'Japanese service charge','🛂':'passport control','🛃':'customs','🛄':'baggage claim','🛅':'left luggage','🚹':'men room','🚺':'women room','🚼':'baby symbol','⚧️':'transgender symbol','🚻':'restroom','🚮':'litter in bin sign','🎦':'cinema','📶':'antenna bars','🈁':'Japanese here','🔣':'input symbols','ℹ️':'information','🔤':'input latin lowercase','🔡':'input latin lowercase','🔠':'input latin uppercase','🆖':'NG button','🆗':'OK button','🆙':'UP button','🆒':'COOL button','🆕':'NEW button','🆓':'FREE button','0️⃣':'keycap 0','1️⃣':'keycap 1','2️⃣':'keycap 2','3️⃣':'keycap 3','4️⃣':'keycap 4','5️⃣':'keycap 5','6️⃣':'keycap 6','7️⃣':'keycap 7','8️⃣':'keycap 8','9️⃣':'keycap 9','🔟':'keycap 10','🔢':'input numbers','#️⃣':'keycap number sign','*️⃣':'keycap asterisk','⏏️':'eject button','▶️':'play button','⏸️':'pause button','⏯️':'play or pause button','⏹️':'stop button','⏺️':'record button','⏭️':'next track button','⏮️':'last track button','⏩':'fast-forward button','⏪':'fast reverse button','⏫':'fast up button','⏬':'fast down button','◀️':'reverse button','🔼':'upwards button','🔽':'downwards button','➡️':'right arrow','⬅️':'left arrow','⬆️':'up arrow','⬇️':'down arrow','↗️':'up-right arrow','↘️':'down-right arrow','↙️':'down-left arrow','↖️':'up-left arrow','↕️':'up-down arrow','↔️':'left-right arrow','↪️':'right arrow curving left','↩️':'left arrow curving right','⤴️':'right arrow curving up','⤵️':'right arrow curving down','🔀':'shuffle tracks button','🔁':'repeat button','🔂':'repeat single button','🔄':'counterclockwise arrows button','🔃':'clockwise vertical arrows','➕':'plus','➖':'minus','➗':'divide','✖️':'multiply','♾️':'infinity','💲':'heavy dollar sign','💱':'currency exchange','™️':'trade mark','©️':'copyright','®️':'registered','〰️':'wavy dash','➰':'curly loop','➿':'double curly loop','🔚':'END arrow','🔙':'BACK arrow','🔛':'ON arrow','🔝':'TOP arrow','🔜':'SOON arrow','✔️':'check mark','☑️':'check box with check','🔘':'radio button','🔴':'red circle','🟠':'orange circle','🟡':'yellow circle','🟢':'green circle','🔵':'blue circle','🟣':'purple circle','⚫':'black circle','⚪':'white circle','🟤':'brown circle','🔺':'red triangle pointed up','🔻':'red triangle pointed down','🔸':'small orange diamond','🔹':'small blue diamond','🔶':'large orange diamond','🔷':'large blue diamond','🔳':'white square button','🔲':'black square button','▪️':'black small square','▫️':'white small square','◾':'black medium-small square','◽':'white medium-small square','◼️':'black medium square','◻️':'white medium square','🟥':'red square','🟧':'orange square','🟨':'yellow square','🟩':'green square','🟦':'blue square','🟪':'purple square','⬛':'black large square','⬜':'white large square','🟫':'brown square','🔈':'speaker low volume','🔇':'muted speaker','🔉':'speaker medium volume','🔊':'speaker high volume','🔔':'bell with slash','🔕':'bell with slash','📣':'megaphone','📢':'loudspeaker',
    '🏁':'chequered flag','🚩':'triangular flag','🎌':'crossed flags','🏴':'black flag','🏳️':'white flag','🏳️‍🌈':'rainbow flag','🏳️‍⚧️':'transgender flag','🏴‍☠️':'pirate flag','🇺🇸':'United States','🇬🇧':'United Kingdom','🇫🇷':'France','🇩🇪':'Germany','🇯🇵':'Japan','🇰🇷':'South Korea','🇨🇳':'China','🇮🇳':'India','🇧🇷':'Brazil','🇷🇺':'Russia','🇮🇹':'Italy','🇪🇸':'Spain','🇨🇦':'Canada','🇦🇺':'Australia','🇲🇽':'Mexico','🇦🇷':'Argentina','🇹🇷':'Turkey','🇸🇦':'Saudi Arabia','🇦🇪':'United Arab Emirates','🇹🇭':'Thailand','🇻🇳':'Vietnam','🇮🇩':'Indonesia','🇵🇭':'Philippines','🇲🇾':'Malaysia','🇸🇬':'Singapore','🇳🇿':'New Zealand','🇿🇦':'South Africa','🇳🇬':'Nigeria','🇰🇪':'Kenya','🇪🇬':'Egypt','🇬🇭':'Ghana','🇨🇴':'Colombia','🇵🇪':'Peru','🇨🇱':'Chile','🇪🇨':'Ecuador','🇻🇪':'Venezuela','🇵🇦':'Panama','🇨🇷':'Costa Rica','🇭🇳':'Honduras','🇸🇻':'El Salvador','🇳🇮':'Nicaragua','🇬🇹':'Guatemala','🇧🇴':'Bolivia','🇵🇾':'Paraguay','🇺🇾':'Uruguay','🇮🇸':'Iceland','🇳🇴':'Norway','🇸🇪':'Sweden','🇫🇮':'Finland','🇩🇰':'Denmark','🇳🇱':'Netherlands','🇧🇪':'Belgium','🇨🇭':'Switzerland','🇦🇹':'Austria','🇵🇱':'Poland','🇨🇿':'Czech Republic','🇵🇹':'Portugal','🇬🇷':'Greece','🇷🇴':'Romania','🇭🇺':'Hungary','🇺🇦':'Ukraine','🇮🇪':'Ireland','🇮🇱':'Israel','🇱🇧':'Lebanon',
  };

  categories: EmojiCategory[] = [
    {
      id: 'emoji',
      label: 'Smileys & People',
      icon: '😀',
      emojis: [
        '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃',
        '😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
        '🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢',
        '🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏',
        '😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷',
        '🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠',
        '🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','☹️',
        '😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰',
        '😥','😢','😭','😱','😖','😣','😞','😓','😩','😫',
        '🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩',
        '🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹',
        '😻','😼','😽','🙀','😿','😾','🫶','🫰','🫱','🫲',
        '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞',
        '🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️',
        '🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶',
        '👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂',
      ],
    },
    {
      id: 'nature',
      label: 'Animals & Nature',
      icon: '🐶',
      emojis: [
        '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨',
        '🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒',
        '🐔','🐧','🐦','🐤','🐣','🦆','🦅','🦉','🦇','🐺',
        '🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜',
        '🪰','🪲','🪳','🦟','🦗','🕷️','🦂','🐢','🐍','🦎',
        '🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟',
        '🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧',
        '🌺','🌻','🌹','🌷','🌸','💐','🌾','🍀','🍁','🍂',
        '🍃','🌿','☘️','🪴','🌵','🌴','🌳','🌲','🪵','🪨',
      ],
    },
    {
      id: 'food',
      label: 'Food & Drink',
      icon: '🍔',
      emojis: [
        '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐',
        '🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑',
        '🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅',
        '🥔','🍠','🥐','🥖','🍞','🥨','🥚','🧀','🍖','🍗',
        '🥩','🥓','🍔','🍟','🍕','🫓','🥪','🌮','🌯','🫔',
        '🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿',
        '🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝',
        '🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡',
        '🦀','🦞','🦐','🦑','🍦','🍧','🍨','🍩','🍪','🎂',
        '🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛',
        '☕','🫖','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻',
        '🥂','🥃','🫗','🥤','🧋','🧃','🧉','🧊','🥢','🍽️',
      ],
    },
    {
      id: 'activities',
      label: 'Activities',
      icon: '⚽',
      emojis: [
        '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱',
        '🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳',
        '🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷',
        '⛸️','🥌','🎿','🎯','🪩','🎲','♟️','🧩','🎭','🎨',
        '🎪','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗',
        '🎸','🪕','🎻','🎮','🕹️','🎰','🎲','🏆','🏅','🥇',
        '🥈','🥉','⚽','🎪','🎬','🎤','🎧','🎼','🎵','🎶',
      ],
    },
    {
      id: 'objects',
      label: 'Objects',
      icon: '💡',
      emojis: [
        '⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️',
        '🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥',
        '📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️',
        '🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋',
        '🪫','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵',
        '💴','💶','💷','🪙','💰','💳','🪪','📦','📫','📪',
        '📬','📭','📮','🗳️','✏️','✒️','🖋️','🖊️','🖌️','🖍️',
        '📝','💼','📁','📂','🗂️','📅','📆','🗒️','🗓️','📇',
        '📈','📉','📊','📋','📌','📍','📎','🖇️','📏','📐',
        '🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🔫',
        '🪃','🏹','🛡️','🔧','🪛','🔩','⚙️','🗜️','⚖️','🦯',
      ],
    },
    {
      id: 'symbols',
      label: 'Symbols',
      icon: '💜',
      emojis: [
        '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
        '❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝',
        '💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️',
        '☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎',
        '♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️',
        '📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮',
        '🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎',
        '🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯',
        '💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗',
        '❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸',
        '🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎',
        '🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗',
        '🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️',
        '🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠',
        '🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣',
        '4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣',
        '⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪',
        '⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️',
        '↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀',
        '🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️',
        '♾️','💲','💱','™️','©️','®️','〰️','➰','➿','🔚',
        '🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡',
        '🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹',
        '🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️',
        '🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈',
        '🔇','🔉','🔊','🔔','🔕','📣','📢',
      ],
    },
    {
      id: 'flags',
      label: 'Flags',
      icon: '🏁',
      emojis: [
        '🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️',
        '🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇯🇵','🇰🇷','🇨🇳','🇮🇳',
        '🇧🇷','🇷🇺','🇮🇹','🇪🇸','🇨🇦','🇦🇺','🇲🇽','🇦🇷',
        '🇹🇷','🇸🇦','🇦🇪','🇹🇭','🇻🇳','🇮🇩','🇵🇭','🇲🇾',
        '🇸🇬','🇳🇿','🇿🇦','🇳🇬','🇰🇪','🇪🇬','🇬🇭','🇨🇴',
        '🇵🇪','🇨🇱','🇪🇨','🇻🇪','🇵🇦','🇨🇷','🇭🇳','🇸🇻',
        '🇳🇮','🇬🇹','🇧🇴','🇵🇾','🇺🇾','🇮🇸','🇳🇴','🇸🇪',
        '🇫🇮','🇩🇰','🇳🇱','🇧🇪','🇨🇭','🇦🇹','🇵🇱','🇨🇿',
        '🇵🇹','🇬🇷','🇷🇴','🇭🇺','🇺🇦','🇮🇪','🇮🇱','🇱🇧',
      ],
    },
  ];

  get visibleCategories(): EmojiCategory[] {
    return this.categories.filter(c => c.id !== 'search');
  }

  ngOnInit(): void {}

  select(emoji: string): void {
    this.emojiSelect.emit(emoji);
  }

  getEmojiName(emoji: string): string {
    return this.emojiNameMap[emoji] || 'Emoji';
  }
}
