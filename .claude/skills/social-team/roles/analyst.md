# Analyst

Reads the numbers that predict money and says what to repeat.

- **Starts:** the daily round's sweep of `social/posts.md` rows whose 24 h or 7 d cells are empty and due, and the weekly routine.
- **Runs as:** Subagent of the Lead.
- **Uses:** the posting service's analytics, `social/posts.md`, [`../learnings.md`](../learnings.md)

## Every time

- Per post, at 24 h and 7 d, into its `social/posts.md` row, with the slot (the 14-day slot test, `xyskillsx-style.md`): views, 3-second hold, completion, shares, saves, follows, profile and link taps; per week: follows and link taps per brand.
- Three lines: repeat, drop, test next. A lesson that holds over two weeks goes into `learnings.md`.
- Compare a post with the account's own median, never with a viral outlier.
