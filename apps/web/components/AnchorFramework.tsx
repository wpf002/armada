/**
 * The A.N.C.H.O.R. Discipleship Framework, transcribed verbatim from Armada's
 * printed one-pager — six anchors, each with its scripture references, three
 * practices, and a closing takeaway, then the mission statement.
 *
 * Designed at 375px first: a fixed letter column beside a fluid text column,
 * scaling up at `sm:`. The app shell caps content at max-w-2xl, so this stays
 * one column at every width rather than reflowing into a grid.
 */

export function AnchorFramework() {
  return (
    <>
      <h2 className="display text-[22px] sm:text-[26px]">A.N.C.H.O.R. Discipleship Framework</h2>
      <p className="mt-2 text-sm text-muted sm:text-[15px]">
        The 6 anchors provide a biblical framework that brings clarity and direction to making
        disciples of Jesus.
      </p>

      <div className="mt-4 flex flex-col gap-2.5">
        {ANCHORS.map((a) => (
          <AnchorCard key={a.letter} {...a} />
        ))}
      </div>

      <p className="mt-4 rounded-card bg-sand px-4 py-4 text-[12.5px] font-bold uppercase leading-[1.7] tracking-[0.05em] text-deep sm:px-5 sm:text-[13px]">
        {MISSION}
      </p>
    </>
  );
}

interface AnchorPoint {
  letter: string;
  title: string;
  refs: string;
  points: string[];
  /** The bold italic takeaway that closes each anchor. */
  summary: string;
}

const ANCHORS: AnchorPoint[] = [
  {
    letter: 'A',
    title: 'Assurance In The Gospel',
    refs: '(1 Corinthians 15:1–4; Ephesians 2:1–10; 1 Peter 3:15)',
    points: [
      'Develop a deep understanding of the gospel and the gift of salvation',
      'Be prepared to share the gospel clearly, confidently, and boldly',
      'Live a life of peace and joy through the security in your salvation',
    ],
    summary:
      'We must fully understand what God has done for us and faithfully share that truth with others.',
  },
  {
    letter: 'N',
    title: 'New Identity In Christ',
    refs: '(Genesis 1:27–28; 1 Corinthians 16:13–14; Ephesians 5)',
    points: [
      'Find identity in who God says we are, not the world',
      'Embrace biblical manhood',
      'Live with purpose, strength, love, and integrity',
    ],
    summary: 'We should live lives that reflect our new identity in Christ.',
  },
  {
    letter: 'C',
    title: 'Commitment To The Church',
    refs: '(Acts 2; Ephesians 4:11–16)',
    points: [
      'Stay connected to the local church and support the global Church',
      'Identify and use spiritual gifts to serve others',
      'Live in authentic community with purpose',
    ],
    summary:
      'The Bible calls every believer to actively participate in God’s work through the Church.',
  },
  {
    letter: 'H',
    title: 'Habits Of Holiness',
    refs: '(1 Timothy 4; 1 Peter 1:15–16)',
    points: [
      'Practice spiritual disciplines such as prayer, studying scripture, fasting, and biblical community',
      'Continually turn away from sinful habits and flee immorality',
      'Pursue purity, spiritual growth, and Christlikeness',
    ],
    summary: 'Every disciple should be marked by a life that increasingly reflects Jesus.',
  },
  {
    letter: 'O',
    title: 'Obey Sound Doctrine',
    refs: '(Proverbs 1:7; 2 Timothy 3:16–17; Psalm 147)',
    points: [
      'Cultivate a deep respect, reverence and awe for who God is',
      'Have a clear understanding on the character of God, Jesus, and the Holy Spirit',
      'Be firmly rooted in biblical truth and how it applies to our lives today',
    ],
    // No closing period — matches the source one-pager.
    summary:
      'Develop a desire for God’s Word and grow in understanding and applying Scripture',
  },
  {
    letter: 'R',
    title: 'Reproduce Disciples',
    refs: '(Matthew 28:18–20; 2 Timothy 2:2; 1 Thessalonians 2:8)',
    points: [
      'Share the gospel with unbelievers',
      'Invest deeply and authentically in others',
      'Help raise up and disciple new believers in Christ',
    ],
    summary: 'God calls us to share the hope we have and make disciples who make disciples.',
  },
];

const MISSION =
  'Our mission is to respond to Jesus’ last commandment to his disciples (Matthew 28:18-20) – to not only share the truth of the gospel but share our lives with one another, equipping and encouraging faithful men who will go on to disciple others.';

function AnchorCard({ letter, title, refs, points, summary }: AnchorPoint) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex gap-3 sm:gap-4">
        {/* Fixed-width letter column keeps every title starting on the same
            vertical line, the way the printed sheet reads. */}
        <span
          aria-hidden
          className="w-7 shrink-0 font-slab text-[34px] font-bold leading-[0.85] text-olive sm:w-9 sm:text-[42px]"
        >
          {letter}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[12.5px] font-semibold uppercase leading-snug tracking-[0.1em] text-ink sm:text-[13.5px]">
            {title}
          </h3>
          <p className="mt-1 text-[11.5px] leading-snug text-muted sm:text-xs">{refs}</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {points.map((p) => (
              <li key={p} className="flex gap-2 text-[13.5px] leading-snug text-ink-soft sm:text-sm">
                <span aria-hidden className="select-none text-olive">
                  •
                </span>
                <span className="min-w-0">{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-2.5 text-[13px] font-semibold italic leading-snug text-deep sm:text-sm">
            {summary}
          </p>
        </div>
      </div>
    </div>
  );
}
