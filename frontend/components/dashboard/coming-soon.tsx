import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ComingSoonProps = {
  title: string;
  description: string;
};

// Placeholder for a sidebar section whose analytics content hasn't been built yet (see the
// 5A-5D build phases in frontend/CLAUDE.md) - keeps every nav link real instead of 404ing.
export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This page is coming soon.
        </p>
      </CardContent>
    </Card>
  );
}
