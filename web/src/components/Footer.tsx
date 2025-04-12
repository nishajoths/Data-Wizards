import { Footer as FlowbiteFooter, FooterCopyright } from 'flowbite-react';

export default function Footer() {
  return (
    <FlowbiteFooter container className="border-t mt-auto">
      <FooterCopyright by="Data Wiz" year={new Date().getFullYear()} />
    </FlowbiteFooter>
  );
}
