import { notFound } from "next/navigation";
import { PRODUCTS, PRODUCT_BY_SLUG } from "@/experiments/registry";
import { LabBody } from "./LabBody";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/lab/[slug]">) {
  const p = PRODUCT_BY_SLUG.get((await params).slug);
  return p ? { title: p.title, description: p.tagline } : {};
}

export default async function LabPage({ params }: PageProps<"/lab/[slug]">) {
  const product = PRODUCT_BY_SLUG.get((await params).slug);
  if (!product) notFound();
  return <LabBody product={product} />;
}
