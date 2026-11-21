begin;

alter table public.homepage_slides
  add column if not exists transition_style text not null default 'fade';

alter table public.homepage_slides
  drop constraint if exists homepage_slides_transition_style_check;

alter table public.homepage_slides
  add constraint homepage_slides_transition_style_check
  check (transition_style in ('fade', 'slide-left', 'slide-up', 'zoom'));

comment on column public.homepage_slides.transition_style is
  'Entry animation used by the single image-first homepage hero when this slide becomes active.';

commit;
